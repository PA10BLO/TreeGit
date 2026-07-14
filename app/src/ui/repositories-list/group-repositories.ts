import * as Path from 'path'

import {
  Repository,
  ILocalRepositoryState,
  nameOf,
  isRepositoryWithGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { getHTMLURL } from '../../lib/api'
import { caseInsensitiveCompare, compare } from '../../lib/compare'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'
import { IAheadBehind } from '../../models/branch'
import { assertNever } from '../../lib/fatal-error'
import { isDotCom } from '../../lib/endpoint-capabilities'
import { Owner } from '../../models/owner'
import { SubmoduleEntry } from '../../models/submodule'

export type RepositoryListGroup =
  | {
      kind: 'recent' | 'other'
    }
  | {
      kind: 'dotcom'
      owner: Owner
    }
  | {
      kind: 'enterprise'
      host: string
    }
  | {
      kind: 'submodules'
    }

/**
 * Returns a unique grouping key (string) for a repository group. Doubles as a
 * case sensitive sorting key (i.e the case sensitive sort order of the keys is
 * the order in which the groups will be displayed in the repository list).
 */
export const getGroupKey = (group: RepositoryListGroup) => {
  const { kind } = group
  switch (kind) {
    case 'recent':
      return `0:recent`
    case 'dotcom':
      return `1:dotcom:${group.owner.login}`
    case 'enterprise':
      return `2:enterprise:${group.host}`
    case 'other':
      return `3:other`
    case 'submodules':
      return `4:submodules`
    default:
      assertNever(group, `Unknown repository group kind ${kind}`)
  }
}
export type Repositoryish = Repository | CloningRepository

export interface IRepositoryListItem extends IFilterListItem {
  readonly text: ReadonlyArray<string>
  readonly id: string
  readonly repository: Repositoryish
  readonly needsDisambiguation: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  readonly isSubmodule: boolean
  readonly submodulePath: string | null
  readonly submoduleDisplayName: string | null
}

const recentRepositoriesThreshold = 7

const getHostForRepository = (repo: RepositoryWithGitHubRepository) =>
  new URL(getHTMLURL(repo.gitHubRepository.endpoint)).host

const getGroupForRepository = (
  repo: Repositoryish,
  isSubmodule: boolean
): RepositoryListGroup => {
  if (isSubmodule) {
    return { kind: 'submodules' }
  }

  if (repo instanceof Repository && isRepositoryWithGitHubRepository(repo)) {
    return isDotCom(repo.gitHubRepository.endpoint)
      ? { kind: 'dotcom', owner: repo.gitHubRepository.owner }
      : { kind: 'enterprise', host: getHostForRepository(repo) }
  }
  return { kind: 'other' }
}

type RepoGroupItem = { group: RepositoryListGroup; repos: Repositoryish[] }

const isPathWithin = (path: string, parentPath: string) => {
  const relativePath = Path.relative(parentPath, path)
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${Path.sep}`) &&
    !Path.isAbsolute(relativePath)
  )
}

const getSubmoduleRepositoryIDs = (
  repositories: ReadonlyArray<Repositoryish>
) => {
  const localRepositories = repositories.filter(
    (repository): repository is Repository => repository instanceof Repository
  )
  const submoduleRepositoryIDs = new Set<number>()

  for (const repository of localRepositories) {
    for (const possibleParent of localRepositories) {
      if (repository.id === possibleParent.id) {
        continue
      }

      const modulesPath = Path.join(possibleParent.resolvedGitDir, 'modules')
      if (isPathWithin(repository.resolvedGitDir, modulesPath)) {
        submoduleRepositoryIDs.add(repository.id)
        break
      }
    }
  }

  return submoduleRepositoryIDs
}

export function groupRepositories(
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  recentRepositories: ReadonlyArray<number>,
  selectedRepository: Repository | null = null,
  submodules: ReadonlyArray<SubmoduleEntry> = []
): ReadonlyArray<IFilterListGroup<IRepositoryListItem, RepositoryListGroup>> {
  const includeRecentGroup = repositories.length > recentRepositoriesThreshold
  const recentSet = includeRecentGroup ? new Set(recentRepositories) : undefined
  const groups = new Map<string, RepoGroupItem>()
  const submoduleRepositoryIDs = getSubmoduleRepositoryIDs(repositories)

  const addToGroup = (group: RepositoryListGroup, repo: Repositoryish) => {
    const key = getGroupKey(group)
    let rg = groups.get(key)
    if (!rg) {
      rg = { group, repos: [] }
      groups.set(key, rg)
    }

    rg.repos.push(repo)
  }

  for (const repo of repositories) {
    if (recentSet?.has(repo.id) && repo instanceof Repository) {
      addToGroup({ kind: 'recent' }, repo)
    }

    addToGroup(
      getGroupForRepository(
        repo,
        repo instanceof Repository && submoduleRepositoryIDs.has(repo.id)
      ),
      repo
    )
  }

  const repositoryGroups = Array.from(groups)
    .sort(([xKey], [yKey]) => compare(xKey, yKey))
    .map(([, { group, repos }]) => ({
      identifier: group,
      items: toSortedListItems(
        group,
        repos,
        localRepositoryStateLookup,
        groups,
        submoduleRepositoryIDs
      ),
    }))

  const directSubmoduleItems = createDirectSubmoduleListItems(
    repositories,
    selectedRepository,
    submodules
  )

  if (directSubmoduleItems.length === 0) {
    return repositoryGroups
  }

  const submoduleGroup = repositoryGroups.find(
    group => group.identifier.kind === 'submodules'
  )

  if (submoduleGroup === undefined) {
    return [
      ...repositoryGroups,
      {
        identifier: { kind: 'submodules' },
        items: directSubmoduleItems,
      },
    ]
  }

  return repositoryGroups.map(group =>
    group === submoduleGroup
      ? {
          ...group,
          items: [...group.items, ...directSubmoduleItems].sort((x, y) =>
            caseInsensitiveCompare(x.text[0], y.text[0])
          ),
        }
      : group
  )
}

const createDirectSubmoduleListItems = (
  repositories: ReadonlyArray<Repositoryish>,
  selectedRepository: Repository | null,
  submodules: ReadonlyArray<SubmoduleEntry>
): ReadonlyArray<IRepositoryListItem> => {
  if (selectedRepository === null || submodules.length === 0) {
    return []
  }

  const registeredPaths = new Set(
    repositories
      .filter(
        (repository): repository is Repository =>
          repository instanceof Repository
      )
      .map(repository => Path.resolve(repository.path))
  )

  return submodules
    .map(submodule => ({
      submodule,
      fullPath: Path.resolve(selectedRepository.path, submodule.path),
    }))
    .filter(({ fullPath }) => !registeredPaths.has(fullPath))
    .map(({ submodule, fullPath }) => ({
      text: [submodule.path, submodule.sha, submodule.describe, 'submodule'],
      id: `submodule:${fullPath}`,
      repository: selectedRepository,
      needsDisambiguation: false,
      aheadBehind: null,
      changedFilesCount: 0,
      isSubmodule: true,
      submodulePath: fullPath,
      submoduleDisplayName: submodule.path,
    }))
    .sort((x, y) =>
      caseInsensitiveCompare(x.submoduleDisplayName, y.submoduleDisplayName)
    )
}

// Returns the display title for a repository, which is either the alias
// (if available) or the name.
const getDisplayTitle = (r: Repositoryish) =>
  r instanceof Repository && r.alias != null ? r.alias : r.name

const toSortedListItems = (
  group: RepositoryListGroup,
  repositories: ReadonlyArray<Repositoryish>,
  localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
  groups: Map<string, RepoGroupItem>,
  submoduleRepositoryIDs: ReadonlySet<number>
): IRepositoryListItem[] => {
  const groupNames = new Map<string, number>()
  const allNames = new Map<string, number>()

  for (const groupItem of groups.values()) {
    // All items in the recent group are by definition present in another
    // group and therefore we don't want to count them.
    if (groupItem.group.kind === 'recent') {
      continue
    }

    for (const title of groupItem.repos.map(getDisplayTitle)) {
      allNames.set(title, (allNames.get(title) ?? 0) + 1)
      if (groupItem.group === group) {
        groupNames.set(title, (groupNames.get(title) ?? 0) + 1)
      }
    }
  }

  return repositories
    .map(r => {
      const repoState = localRepositoryStateLookup.get(r.id)
      const title = getDisplayTitle(r)
      const isSubmodule =
        r instanceof Repository && submoduleRepositoryIDs.has(r.id)

      return {
        text:
          r instanceof Repository
            ? [title, nameOf(r), ...(isSubmodule ? ['submodule'] : [])]
            : [title],
        id: r.id.toString(),
        repository: r,
        needsDisambiguation:
          // If the repository is in the enterprise group and has a duplicate
          // name in the group, we need to disambiguate it. We don't have to
          // disambiguate repositories in the 'dotcom' group because they are
          // already grouped by owner. If the repository is in the 'recent'
          // group and has a duplicate name in any group, we need to
          // disambiguate it.
          ((groupNames.get(title) ?? 0) > 1 && group.kind === 'enterprise') ||
          ((allNames.get(title) ?? 0) > 1 && group.kind === 'recent'),
        aheadBehind: repoState?.aheadBehind ?? null,
        changedFilesCount: repoState?.changedFilesCount ?? 0,
        isSubmodule,
        submodulePath: null,
        submoduleDisplayName: null,
      }
    })
    .sort(({ repository: x }, { repository: y }) =>
      caseInsensitiveCompare(getDisplayTitle(x), getDisplayTitle(y))
    )
}
