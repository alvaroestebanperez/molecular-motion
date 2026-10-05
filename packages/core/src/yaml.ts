import { parse } from 'yaml';
import type { MechanismDefinition } from './types';
import { MechanismValidationError, validateMechanism, type ValidateOptions } from './validate';

/**
 * The YAML entry of the package: `@molecular-motion/core/yaml`. It is the only module that imports the
 * YAML parser, so a page that receives its mechanisms already parsed never loads it. A string is read
 * as YAML, which includes JSON; anything else is validated as a document, like `validateMechanism`.
 */
export function parseMechanism(source: string | unknown, options: ValidateOptions = {}): MechanismDefinition {
  if (typeof source !== 'string') return validateMechanism(source, options);
  let document: unknown;
  try {
    document = parse(source);
  } catch (error) {
    throw new MechanismValidationError([error instanceof Error ? error.message : 'unable to parse definition']);
  }
  return validateMechanism(document, options);
}
