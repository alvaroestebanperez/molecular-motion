import { parse } from 'yaml';
import type { MechanismDefinition } from './types';
import { MechanismValidationError, validateMechanism } from './validate';

export function parseMechanism(source: string | unknown): MechanismDefinition {
  if (typeof source !== 'string') return validateMechanism(source);
  try {
    return validateMechanism(parse(source));
  } catch (error) {
    if (error instanceof MechanismValidationError) throw error;
    throw new MechanismValidationError([error instanceof Error ? error.message : 'unable to parse definition']);
  }
}
