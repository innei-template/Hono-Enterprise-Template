export const RESPONSE_TRANSFORM_BYPASS = Symbol.for('core.response_transform.bypass')

export function BypassResponseTransform(): MethodDecorator & ClassDecorator {
  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    const targetForMetadata = descriptor?.value && typeof descriptor.value === 'function' ? descriptor.value : target
    Reflect.defineMetadata(RESPONSE_TRANSFORM_BYPASS, true, targetForMetadata)
  }
}
