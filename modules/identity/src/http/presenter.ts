import {
  IdentityErrorCodes,
  Me,
  type NotOnAccessListDetails,
  Session,
  SignInRedirect,
  User as UserDto,
} from '@arv/contracts/identity';
import { Conflict, NotFound, Refused } from '@arv/contracts/shared';
import { Schema } from 'effect';
import type { SignInStart } from '../application/begin-sign-in';
import type { NotSetUp, SignedIn } from '../application/complete-sign-in';
import type { MeView } from '../application/get-me';
import type { SignInRefused } from '../application/ports';
import type { EmailTaken, UserNotFound } from '../domain/errors';
import type { User } from '../domain/user';

const encodeUser = Schema.encodeSync(UserDto);

export const presentUser = (user: User) => encodeUser(user);

export const toContractError = (error: UserNotFound | EmailTaken) => {
  switch (error._tag) {
    case 'UserNotFound':
      return new NotFound({ resource: 'User', id: error.id, code: 'identity.user_not_found' });
    case 'EmailTaken':
      return new Conflict({
        message: `User with email ${error.email} already exists`,
        code: 'identity.email_taken',
      });
  }
};

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
