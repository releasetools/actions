/**
 * The shape of a project group, as `.releasetools.yaml` declares it.
 *
 * The reader and its rules live in `packages/config`, which the release-notes
 * plugin carries verbatim: two readers would be two answers to which project a
 * change belongs to.
 */
export type { ProjectGroup } from '../../packages/config/releasetools-config';
