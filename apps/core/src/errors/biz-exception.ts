import type { ErrorCode, ErrorDescriptor } from './error-codes'
import { ERROR_CODE_DESCRIPTORS } from './error-codes'

export interface BizExceptionOptions<TDetails = unknown> {
  message?: string
  details?: TDetails
  cause?: unknown
}

export interface BizErrorResponse<TDetails = unknown> {
  code: ErrorCode
  message: string
  details?: TDetails
}

export class BizException<TDetails = unknown> extends Error {
  readonly code: ErrorCode
  readonly details?: TDetails
  private readonly httpStatus: number

  constructor(code: ErrorCode, options?: BizExceptionOptions<TDetails>) {
    const descriptor: ErrorDescriptor = ERROR_CODE_DESCRIPTORS[code]
    super(options?.message ?? descriptor.message, options?.cause ? { cause: options.cause } : undefined)
    this.name = 'BizException'
    this.code = code
    this.details = options?.details
    this.httpStatus = descriptor.httpStatus
  }

  getHttpStatus(): number {
    return this.httpStatus
  }

  toResponse(): BizErrorResponse<TDetails> {
    const response: BizErrorResponse<TDetails> = {
      code: this.code,
      message: this.message,
    }

    if (this.details !== undefined) {
      response.details = this.details
    }

    return response
  }
}
