import { strictEqual, deepStrictEqual } from 'assert'
import { describe, it } from 'node:test'

import { DiffSelection, DiffSelectionType } from '../../src/models/diff'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../src/models/status'
import { createChangeTreeGroups } from '../../src/ui/changes/change-tree-groups'

function createFile(path: string, selection: DiffSelectionType) {
  return new WorkingDirectoryFileChange(
    path,
    { kind: AppFileStatusKind.Modified },
    DiffSelection.fromInitialSelection(selection)
  )
}

describe('change tree groups', () => {
  it('orders staged folders before unstaged folders and files by path', () => {
    const groups = createChangeTreeGroups([
      createFile('styles/theme.scss', DiffSelectionType.None),
      createFile('src/zeta.ts', DiffSelectionType.All),
      createFile('src/alpha.ts', DiffSelectionType.All),
      createFile('README.md', DiffSelectionType.None),
    ])

    strictEqual(groups.length, 3)
    deepStrictEqual(
      groups.map(group => group.identifier.replace('\u0000', ':')),
      ['staged:src', 'unstaged:.', 'unstaged:styles']
    )
    deepStrictEqual(
      groups[0].items.map(item => item.change.path),
      ['src/alpha.ts', 'src/zeta.ts']
    )
  })
})
