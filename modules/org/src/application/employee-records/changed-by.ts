import { requireSignedIn } from '../access';

/** The signed-in user a write is stamped with («last changed by», sad §8). */
export const changedBy = requireSignedIn;
