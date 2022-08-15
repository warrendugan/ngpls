import { BuilderContext } from '@angular-devkit/architect';
import { AWSError, CloudFront, S3 } from 'aws-sdk';
import { Schema } from './schema';
import {
  getAccessKeyId,
  getBucket,
  getCallerReference,
  getDistributionId,
  getRegion,
  getSecretAccessKey,
} from './config';
import {
  CreateBucketRequest,
  HeadBucketRequest,
  HeadObjectOutput,
  ManagedUpload,
  PutObjectRequest,
} from 'aws-sdk/clients/s3';
import {
  CreateCloudFrontOriginAccessIdentityRequest,
  CreateCloudFrontOriginAccessIdentityResult,
  CreateDistributionRequest,
  CreateDistributionResult,
  CreateInvalidationResult,
  GetCloudFrontOriginAccessIdentityConfigResult,
} from 'aws-sdk/clients/cloudfront';
import { CreateBucketResult } from 'aws-sdk/clients/s3control';
import * as fs from 'fs';
import * as path from 'path';
import * as mimeTypes from 'mime-types';

export class AWS {
  private _context: BuilderContext;
  private _s3: S3;
  private _cf: CloudFront;
  private _name: string;
  private _bucket: string;
  private _region: string;
  private _builderConfig: Schema;
  private _distributionId: string;
  private _callerReference: string;
  private _defaultComment: string = 'Remember to user your manners';

  constructor(builderConfig: Schema, context?: BuilderContext) {
    if (context) {
      this._context = context;
    }

    this._builderConfig = builderConfig;
    this._bucket = getBucket(this._builderConfig);
    this._region = getRegion(this._builderConfig);
    this._distributionId = getDistributionId(this._builderConfig);
    this._callerReference = getCallerReference();

    this._s3 = new S3({
      apiVersion: 'latest',
      secretAccessKey: getSecretAccessKey(),
      accessKeyId: getAccessKeyId(),
      region: this._region,
    });
    this._cf = new CloudFront({
      apiVersion: 'latest',
      secretAccessKey: getSecretAccessKey(),
      accessKeyId: getAccessKeyId(),
      region: this._region,
    });
  }

  log(
    methodName: keyof AWS,
    verb: 'Started' | 'Finished' | 'Creating' | 'Uploading',
    noun:
      | 'bucket'
      | 'distribution'
      | 'identity'
      | 'file'
      | 'origin'
      | 'invalidation',
    err?: any
  ): void {
    if (!this._context) {
      this._context = {
        logger: {
          error: console.error,
          info: console.log,
        },
      } as any;
      return;
    }

    this._context.logger[err ? 'error' : 'info'](
      `${methodName} Result: ${err ? '❌  Failed ' : '✅  '} ${verb} ${noun}`
    );
  }

  async createBucket() {
    this.log('createBucket', 'Creating', 'bucket');

    let result;
    try {
      const params: CreateBucketRequest = {
        Bucket: `ngpls-sb-${this._name}`,
      };

      result = this._s3.createBucket(
        params,
        (err: AWSError, data: CreateBucketResult) => {
          if (err || !data.Location) {
            throw err ? err.stack : data;
          }

          this._bucket = data.Location.toString();
          this.log('createBucket', 'Finished', 'bucket');
          return data;
        }
      );
    } catch (error) {
      this.log('createBucket', 'Creating', 'bucket', error);
      throw error.getAwsErrorMessage();
    }

    return result;
  }

  async createDistribution(): Promise<unknown> {
    this.log('createDistribution', 'Creating', 'distribution');

    let result;
    try {
      const params: CreateDistributionRequest = {
        DistributionConfig: {
          CallerReference: this._callerReference,
          Comment: this._defaultComment,
          Origins: {
            Items: [
              {
                DomainName: `${this._bucket}.s3-website-${this._region}.amazonaws.com`,
                Id: `${this._bucket}.s3.${this._region}.amazonaws.com`,
                OriginPath: '',
                CustomHeaders: { Quantity: 0 },
                S3OriginConfig: {
                  OriginAccessIdentity:
                    (await this.createIdentity().then(
                      (data) => data.CloudFrontOriginAccessIdentity?.Id
                    )) || '',
                },
              },
            ],
            Quantity: 1,
          },
          DefaultCacheBehavior: {
            TargetOriginId: '',
            ViewerProtocolPolicy: '',
          },
          Enabled: true,
        },
      };

      result = this._cf.createDistribution(
        params,
        (err, data: CreateDistributionResult) => {
          if (err) {
            this.log('createDistribution', 'Creating', 'distribution', err);
            throw err;
          }

          this.log('createDistribution', 'Finished', 'distribution');
          return data;
        }
      );
    } catch (error) {
      this.log('createDistribution', 'Creating', 'distribution', error);
      result = error.getAwsErrorMessage();
    }

    return result;
  }

  async createIdentity(): Promise<CreateCloudFrontOriginAccessIdentityResult> {
    this.log('createIdentity', 'Creating', 'identity');

    let result;
    try {
      const params: CreateCloudFrontOriginAccessIdentityRequest = {
        CloudFrontOriginAccessIdentityConfig: {
          CallerReference: this._callerReference,
          Comment: this._defaultComment,
        },
      };

      this._cf.createCloudFrontOriginAccessIdentity(
        params,
        (err, data: CreateCloudFrontOriginAccessIdentityResult) => {
          if (err) {
            this.log('createIdentity', 'Creating', 'identity', err);
            throw err;
          }

          this.log('createIdentity', 'Finished', 'identity');
          return data;
        }
      );
    } catch (error) {
      this.log('createIdentity', 'Creating', 'identity', error);
      result = error.getAwsErrorMessage();
    }

    return result;
  }

  async createInvalidation() {
    this.log('createInvalidation', 'Creating', 'invalidation');

    let result;
    try {
      const params = {
        DistributionId: this._distributionId,
        InvalidationBatch: {
          CallerReference: this._callerReference,
          Paths: {
            Quantity: 1,
            Items: ['/index.html'],
          },
        },
      };

      result = await this._cf
        .createInvalidation(
          params,
          (err: AWSError, data: CreateInvalidationResult) => {
            if (err) {
              this.log('createInvalidation', 'Creating', 'invalidation', err);
              throw err;
            }

            this.log('createInvalidation', 'Finished', 'invalidation');
            return data;
          }
        )
        .promise();
    } catch (error) {
      this.log('createInvalidation', 'Creating', 'invalidation', error);
      result = error.getAwsErrorMessage();
    }

    return result;
  }

  async upload(files: string[], filesPath: string): Promise<boolean> {
    let result;
    try {
      if (!this._bucket) {
        this.log('upload', 'Uploading', 'file', {
          error: { stack: 'Bucket param required for deployment' },
        });
        return false;
      }

      const params: HeadBucketRequest = {
        Bucket: this._bucket,
      };

      result = await this._s3
        .headBucket(params)
        .promise()
        .then(async () => {
          await this.uploadFiles(files, filesPath);
        })
        .then(async () => {
          await this.createInvalidation();
        })
        .catch((error) => {
          this.log('upload', 'Uploading', 'file', error);
          throw error;
        });
    } catch (err) {
      this.log('upload', 'Uploading', 'file', err);
      throw err;
    }

    this.log('upload', 'Finished', 'file');
    return result;
  }

  async uploadFiles(files: string[], filesPath: string) {
    return Promise.all(
      files.map(async (file) => {
        await this.uploadFile(path.join(filesPath, file), file);
      })
    );
  }

  async uploadFile(localFilePath: string, originFilePath: string) {
    const fileName = path.basename(localFilePath);
    const body = fs.createReadStream(localFilePath);
    body.on('error', function (err) {
      console.log('File Error', err);
    });

    const params: PutObjectRequest = {
      Bucket: this._bucket,
      Key: originFilePath,
      Body: body,
      ContentType: mimeTypes.lookup(fileName) || undefined,
    };

    await this._s3
      .upload(params)
      .promise()
      .then(() => this.log('uploadFile', 'Finished', 'file'))
      .catch((item) => {
        this.log('uploadFile', 'Uploading', 'file', item);
        throw item;
      });
  }
}
