import 'reflect-metadata';
import { CONTROLLER_METADATA } from '../constants';
import type { Constructor } from '../interfaces';

export interface ControllerMetadata {
  prefix: string;
}

export const Controller = (prefix = ''): ClassDecorator => {
  return (target) => {
    Reflect.defineMetadata(
      CONTROLLER_METADATA,
      {
        prefix,
      } satisfies ControllerMetadata,
      target as unknown as Constructor,
    );
  };
};

export const getControllerMetadata = (target: Constructor): ControllerMetadata => {
  return (
    Reflect.getMetadata(CONTROLLER_METADATA, target) || {
      prefix: '',
    }
  ) as ControllerMetadata;
};
