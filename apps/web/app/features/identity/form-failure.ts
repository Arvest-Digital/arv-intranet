import { IdentityErrorCodes } from '@arv/contracts/identity';
import type { ApiFailure } from '~/shared/lib/api.server';
import type { FormField } from './components/access-list-form';

/** Refusals that belong under one input, with the words the design uses for them. */
const FIELD_ERRORS: Record<string, { field: FormField; error: string }> = {
  [IdentityErrorCodes.emailNotCompanyDomain]: {
    field: 'email',
    error: 'Only company-domain addresses can be added.',
  },
  [IdentityErrorCodes.emailTaken]: {
    field: 'email',
    error: 'This address is already on the access list.',
  },
  [IdentityErrorCodes.duplicateAccessRoleName]: {
    field: 'name',
    error: 'An access role with that name already exists.',
  },
};

/** An api refusal as a form shows it: under its field when it has one, else the api's message. */
export function formFailure(failure: Pick<ApiFailure, 'message' | 'code'>): {
  readonly error: string;
  readonly field?: FormField;
} {
  return (failure.code && FIELD_ERRORS[failure.code]) || { error: failure.message };
}
