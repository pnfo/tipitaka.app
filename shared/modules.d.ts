declare module '@pnfo/pali-converter' {
  export const Script: Record<string, string>
  export function convert(text: string, toScript: string, fromScript: string, options?: Record<string, unknown>): string
  export function convertMixed(text: string, toScript: string, options?: Record<string, unknown>): string
  export function getScriptForCode(charCode: number): string | undefined
}
declare module 'intersection-observer'
