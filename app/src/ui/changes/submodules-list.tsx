// Created by Pablo Urena Simon.

import * as Path from 'path'
import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Repository } from '../../models/repository'
import {
  SubmoduleEntry,
  SubmoduleWorkingTreeState,
} from '../../models/submodule'
import { WorkingDirectoryStatus } from '../../models/status'

interface ISubmodulesListProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly submodules: ReadonlyArray<SubmoduleEntry>
  readonly workingDirectory: WorkingDirectoryStatus
  readonly filterText: string
  readonly onOpenSubmodule: (fullPath: string) => void
}

function getChangeSummary(
  submodule: SubmoduleEntry,
  workingDirectory: WorkingDirectoryStatus
) {
  if (submodule.workingTreeState === SubmoduleWorkingTreeState.Uninitialized) {
    return 'Not initialized'
  }

  if (submodule.workingTreeState === SubmoduleWorkingTreeState.Conflicted) {
    return 'Conflicted'
  }

  const status = workingDirectory.files.find(
    file =>
      file.path === submodule.path && file.status.submoduleStatus !== undefined
  )?.status.submoduleStatus

  if (status === undefined) {
    return submodule.workingTreeState ===
      SubmoduleWorkingTreeState.CommitChanged
      ? 'Commit'
      : 'Clean'
  }

  const changes = [
    status.commitChanged ? 'Commit' : null,
    status.modifiedChanges ? 'Modified' : null,
    status.untrackedChanges ? 'Untracked' : null,
  ].filter((change): change is string => change !== null)

  return changes.length > 0 ? changes.join(', ') : 'Changed'
}

interface ISubmoduleRowProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly submodule: SubmoduleEntry
  readonly summary: string
  readonly onOpenSubmodule: (fullPath: string) => void
}

class SubmoduleRow extends React.Component<ISubmoduleRowProps> {
  private onOpen = async () => {
    const { dispatcher, repository, submodule, onOpenSubmodule } = this.props

    if (
      submodule.workingTreeState === SubmoduleWorkingTreeState.Uninitialized &&
      !(await dispatcher.initializeSubmodule(repository, submodule.path))
    ) {
      return
    }

    onOpenSubmodule(Path.join(repository.path, submodule.path))
  }

  public render() {
    const { submodule, summary } = this.props
    const shortSha = submodule.sha.substring(0, 7)
    const detail =
      submodule.describe.length > 0
        ? `${shortSha} · ${submodule.describe}`
        : shortSha

    return (
      <div role="listitem">
        <button
          type="button"
          className="submodule-list-item"
          aria-label={`${submodule.path}, ${summary}`}
          onClick={this.onOpen}
        >
          <Octicon
            className="submodule-list-item-icon"
            symbol={octicons.fileSubmodule}
          />
          <span className="submodule-list-item-content">
            <span className="submodule-list-item-path">{submodule.path}</span>
            <span className="submodule-list-item-detail">{detail}</span>
          </span>
          <span className="submodule-list-item-status">{summary}</span>
          <Octicon
            className="submodule-list-item-open"
            symbol={octicons.chevronRight}
          />
        </button>
      </div>
    )
  }
}

export function SubmodulesList(props: ISubmodulesListProps) {
  const filter = props.filterText.toLowerCase()
  const submodules =
    filter.length === 0
      ? props.submodules
      : props.submodules.filter(submodule =>
          [submodule.path, submodule.sha, submodule.describe].some(value =>
            value.toLowerCase().includes(filter)
          )
        )

  if (submodules.length === 0) {
    const message =
      props.submodules.length === 0
        ? 'This repository does not have submodules.'
        : 'No submodules match the current filter.'

    return <div className="submodules-list-empty">{message}</div>
  }

  return (
    <div className="submodules-list-view" role="list">
      {submodules.map(submodule => (
        <SubmoduleRow
          key={submodule.path}
          dispatcher={props.dispatcher}
          repository={props.repository}
          submodule={submodule}
          summary={getChangeSummary(submodule, props.workingDirectory)}
          onOpenSubmodule={props.onOpenSubmodule}
        />
      ))}
    </div>
  )
}
