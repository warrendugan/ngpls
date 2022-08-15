import { Tree, formatFiles, installPackagesTask } from '@nrwl/devkit';
import { applicationGenerator } from '@nrwl/angular/generators';
import { AWS } from './aws';
import { Schema } from './schema';
import { BuilderContext } from '@angular-devkit/architect';

export default async function (
  tree: Tree,
  schema: Schema,
  context: BuilderContext
) {
  const aws = new AWS(schema, context);
  await aws.createBucket();
  await aws.createDistribution();
  await applicationGenerator(tree, { name: schema.name });
  await formatFiles(tree);
  return () => {
    installPackagesTask(tree);
  };
}
