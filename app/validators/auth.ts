import vine from '@vinejs/vine'

export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().email().trim(),
    password: vine.string().minLength(1),
  })
)

export const setupValidator = vine.compile(
  vine.object({
    fullName: vine.string().trim().minLength(1).maxLength(255),
    email: vine.string().email().trim(),
    password: vine.string().minLength(8).maxLength(255),
    enableFalkordb: vine.boolean().optional(),
    enableSidecar: vine.boolean().optional(),
    enableMesh: vine.boolean().optional(),
  })
)
