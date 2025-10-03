import 'reflect-metadata'

export const ROLES_METADATA = Symbol.for('core.auth.allowed_roles')

export enum RoleBit {
  USER = 1 << 0,
  ADMIN = 1 << 1,
}

export type RoleName = 'user' | 'admin'

export function roleNameToBit(name: RoleName): RoleBit {
  switch (name) {
    case 'admin': {
      return RoleBit.ADMIN
    }

    default: {
      return RoleBit.USER
    }
  }
}

export function Roles(...roles: Array<RoleBit | RoleName>): MethodDecorator & ClassDecorator {
  const mask = roles.map((r) => (typeof r === 'string' ? roleNameToBit(r) : r)).reduce((m, r) => m | r, 0)

  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    const targetForMetadata = descriptor?.value && typeof descriptor.value === 'function' ? descriptor.value : target
    Reflect.defineMetadata(ROLES_METADATA, mask, targetForMetadata)
  }
}

export function getAllowedRoleMask(target: object): number {
  return (Reflect.getMetadata(ROLES_METADATA, target) || 0) as number
}
