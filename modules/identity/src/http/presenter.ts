import {
  AccessRole,
  AccessRolePage,
  IdentityErrorCodes,
  Me,
  type NotOnAccessListDetails,
  PermissionCatalog,
  PreselectedAccessRole,
  type RuleViolations,
  Session,
  SignInRedirect,
  UserPage,
  UserWithAccessRoles,
} from '@arv/contracts/identity';
import { Conflict, Invalid, NotFound, Refused } from '@arv/contracts/shared';
import type { PermissionDeclaration } from '@arv/kernel';
import { Effect, Schema } from 'effect';
import type { UserAccess } from '../application/access-list';
import type { AccessRoleView } from '../application/access-roles';
import type { SignInStart } from '../application/begin-sign-in';
import type { NotSetUp, SignedIn } from '../application/complete-sign-in';
import type { MeView } from '../application/get-me';
import type { Page } from '../application/page';
import type { AccessRoleId, SignInRefused } from '../application/ports';
import type {
  AccessRoleNameTaken,
  AccessRoleNotFound,
  EmailTaken,
  LastAdminRequired,
  NotCompanyAddress,
  RetiredPermissionNotAssignable,
  UserNotFound,
} from '../domain/errors';

const toUserDto = ({ user, accessRoles, combinedPermissions }: UserAccess) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  accessRoles,
  combinedPermissions,
  createdAt: user.createdAt,
});

/** OpenAPI `User`: the user with their roles and combined permissions, `createdAt` as ISO. */
export const presentUserAccess = (access: UserAccess) =>
  Schema.encodeSync(UserWithAccessRoles)(toUserDto(access));

export const presentUserPage = (page: Page<UserAccess>) =>
  Schema.encodeSync(UserPage)({ ...page, items: page.items.map(toUserDto) });

/** The domain failures of the access-list use cases (openapi.yaml `access-list` tag). */
export type AccessListError =
  | UserNotFound
  | EmailTaken
  | NotCompanyAddress
  | AccessRoleNotFound
  | LastAdminRequired;

const ACCESS_LIST_ERROR_TAGS: ReadonlySet<string> = new Set<AccessListError['_tag']>([
  'UserNotFound',
  'EmailTaken',
  'NotCompanyAddress',
  'AccessRoleNotFound',
  'LastAdminRequired',
]);

const isAccessListError = (error: { readonly _tag: string }): error is AccessListError =>
  ACCESS_LIST_ERROR_TAGS.has(error._tag);

/** Messages are the contract's (openapi.yaml `components.examples`). */
export const toAccessListContractError = (error: AccessListError) => {
  switch (error._tag) {
    case 'UserNotFound':
      return new NotFound({
        resource: 'User',
        id: error.id,
        code: IdentityErrorCodes.userNotFound,
      });
    case 'AccessRoleNotFound':
      return new NotFound({
        resource: 'AccessRole',
        id: error.id,
        code: IdentityErrorCodes.accessRoleNotFound,
      });
    case 'EmailTaken':
      return new Conflict({
        message: 'This address is already on the access list',
        code: IdentityErrorCodes.emailTaken,
      });
    case 'NotCompanyAddress': {
      const details: RuleViolations = { rules: ['not_company_domain'] };
      return new Invalid({
        message: 'Only company-domain addresses can be added',
        code: IdentityErrorCodes.emailNotCompanyDomain,
        details,
      });
    }
    case 'LastAdminRequired':
      return new Conflict({
        message: 'The intranet must keep at least one admin. Appoint another admin first.',
        code: IdentityErrorCodes.lastAdminRequired,
      });
  }
};

/**
 * Maps the access-list domain failures to contract errors and lets every other failure through
 * (the kernel's access errors, which `runEffect` maps once).
 */
export const mapAccessListErrors = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.mapError(effect, (error) =>
    isAccessListError(error)
      ? toAccessListContractError(error)
      : (error as Exclude<E, AccessListError>),
  );

/** OpenAPI `AccessRole`: granted keys split into declared and retired, `createdAt` as ISO. */
export const presentAccessRole = (view: AccessRoleView) => Schema.encodeSync(AccessRole)(view);

export const presentAccessRolePage = (page: Page<AccessRoleView>) =>
  Schema.encodeSync(AccessRolePage)(page);

export const presentPreselectedAccessRole = (mark: {
  readonly accessRoleId: AccessRoleId | null;
}) => Schema.encodeSync(PreselectedAccessRole)(mark);

export const presentPermissionCatalog = (declarations: ReadonlyArray<PermissionDeclaration>) =>
  Schema.encodeSync(PermissionCatalog)({ items: declarations });

/** The domain failures of the access-role use cases (openapi.yaml `access-roles` tag). */
export type AccessRoleError =
  | AccessRoleNotFound
  | AccessRoleNameTaken
  | RetiredPermissionNotAssignable
  | LastAdminRequired;

const ACCESS_ROLE_ERROR_TAGS: ReadonlySet<string> = new Set<AccessRoleError['_tag']>([
  'AccessRoleNotFound',
  'AccessRoleNameTaken',
  'RetiredPermissionNotAssignable',
  'LastAdminRequired',
]);

const isAccessRoleError = (error: { readonly _tag: string }): error is AccessRoleError =>
  ACCESS_ROLE_ERROR_TAGS.has(error._tag);

/** Messages are the contract's (openapi.yaml `components.examples`). */
export const toAccessRoleContractError = (error: AccessRoleError) => {
  switch (error._tag) {
    case 'AccessRoleNotFound':
    case 'LastAdminRequired':
      return toAccessListContractError(error);
    case 'AccessRoleNameTaken':
      return new Conflict({
        message: 'An access role with that name already exists',
        code: IdentityErrorCodes.duplicateAccessRoleName,
      });
    case 'RetiredPermissionNotAssignable': {
      // The keys are the caller's own input, so naming them leaks nothing (AC-16).
      const details: RuleViolations = {
        rules: ['retired_permission'],
        permissionKeys: [...error.keys],
      };
      return new Invalid({
        message: `A retired permission cannot be added: ${error.keys.join(', ')}`,
        code: IdentityErrorCodes.retiredPermission,
        details,
      });
    }
  }
};

/**
 * Maps the access-role domain failures to contract errors and lets every other failure through
 * (the kernel's access errors, which `runEffect` maps once).
 */
export const mapAccessRoleErrors = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.mapError(effect, (error) =>
    isAccessRoleError(error)
      ? toAccessRoleContractError(error)
      : (error as Exclude<E, AccessRoleError>),
  );

export const presentSignInStart = (start: SignInStart) => Schema.encodeSync(SignInRedirect)(start);

/** The raw token is answered once here and nowhere else; `userId` stays on the server. */
export const presentSession = ({ sessionToken, expiresAt }: SignedIn) =>
  Schema.encodeSync(Session)({ sessionToken, expiresAt });

export const presentMe = ({ user, permissions }: MeView) =>
  Schema.encodeSync(Me)({ id: user.id, email: user.email, name: user.name, permissions });

/** Generic on purpose: the body never says which claim failed (AC-02). */
const SIGN_IN_REFUSED_MESSAGE = 'Only verified company Google accounts can sign in';

const NOT_SET_UP_MESSAGE = "You are not on the intranet's access list yet.";

export const toSignInContractError = (error: SignInRefused | NotSetUp) => {
  switch (error._tag) {
    case 'SignInRefused':
      return new Refused({
        message: SIGN_IN_REFUSED_MESSAGE,
        code: IdentityErrorCodes.signInRefused,
      });
    case 'NotSetUp': {
      const details: NotOnAccessListDetails = { admins: error.admins };
      return new Refused({
        message:
          error.admins.length === 0
            ? `${NOT_SET_UP_MESSAGE} Ask your manager.`
            : `${NOT_SET_UP_MESSAGE} Ask one of these admins to add you.`,
        code: IdentityErrorCodes.notOnAccessList,
        details,
      });
    }
  }
};
