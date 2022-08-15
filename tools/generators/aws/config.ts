import { Schema } from './schema';

export const getAccessKeyId = (): string => {
  return process.env.AWS_ACCESS_KEY_ID || '';
};

export const getSecretAccessKey = (): string => {
  return process.env.AWS_SECRET_ACCESS_KEY || '';
};

export const getRegion = (builderConfig: Schema): string => {
  return process.env.AWS_REGION || '';
};

export const getBucket = (builderConfig: Schema): string => {
  return process.env.AWS_BUCKET || builderConfig.bucket || '';
};

export const getDistributionId = (builderConfig: Schema): string => {
  return process.env.AWS_DISTRIBUTION_ID || builderConfig.distributionId || '';
};

export const getName = (builderConfig: Schema): string => {
  return (builderConfig.name as string) || '';
};

export const getCallerReference = (): string => {
  return '@ngpls/aws:deploy_' + new Date().getTime();
};
