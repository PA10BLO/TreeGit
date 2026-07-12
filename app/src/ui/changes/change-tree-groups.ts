import * as Path from 'path'

import { WorkingDirectoryFileChange } from '../../models/status'
import { IFilterListGroup, IFilterListItem } from '../lib/filter-list'

export interface IChangeTreeItem extends IFilterListItem {
  readonly id: string
  readonly text: ReadonlyArray<string>
  readonly change: WorkingDirectoryFileChange
}

type ChangeTreeSection = 'staged' | 'unstaged'

export const ChangeTreeGroupSeparator = '\u0000'

/**
 * Build the visual changes tree. GitHub Desktop's diff selection is the
 * source of truth for what will be committed, so an all/partial selection is
 * shown as staged and an empty selection as unstaged.
 */
export function createChangeTreeGroups(
  files: ReadonlyArray<WorkingDirectoryFileChange>
): ReadonlyArray<IFilterListGroup<IChangeTreeItem>> {
  const groups = new Map<string, IChangeTreeItem[]>()

  for (const file of files) {
    const section: ChangeTreeSection = file.isExcludedFromCommit()
      ? 'unstaged'
      : 'staged'
    const directory = Path.posix.dirname(file.path)
    const groupIdentifier = `${section}${ChangeTreeGroupSeparator}${directory}`
    const item = { text: [file.path], id: file.id, change: file }
    const items = groups.get(groupIdentifier)

    if (items === undefined) {
      groups.set(groupIdentifier, [item])
    } else {
      items.push(item)
    }
  }

  return Array.from(groups, ([identifier, items]) => ({
    identifier,
    items: items.sort((a, b) => a.change.path.localeCompare(b.change.path)),
  })).sort((a, b) => {
    const [aSection, aDirectory] = a.identifier.split(ChangeTreeGroupSeparator)
    const [bSection, bDirectory] = b.identifier.split(ChangeTreeGroupSeparator)
    const sectionOrder =
      aSection === bSection ? 0 : aSection === 'staged' ? -1 : 1

    return sectionOrder || aDirectory.localeCompare(bDirectory)
  })
}
