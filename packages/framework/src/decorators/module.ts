import 'reflect-metadata';
import { MODULE_METADATA } from '../constants';
import type { Constructor, ModuleMetadata } from '../interfaces';

export const Module = (metadata: ModuleMetadata): ClassDecorator => {
  return (target) => {
    Reflect.defineMetadata(MODULE_METADATA, metadata, target as unknown as Constructor);
  };
};

export const getModuleMetadata = (target: Constructor): ModuleMetadata => {
  return (Reflect.getMetadata(MODULE_METADATA, target) || {}) as ModuleMetadata;
};
