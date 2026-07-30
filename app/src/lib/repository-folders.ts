// Created by Pablo Urena Simon.

import * as Path from 'path'

import { Repository } from '../models/repository'
import { getObject, setObject } from './local-storage'

const RepositoryFoldersStorageKey = 'repository-folders-v1'

export interface IRepositoryFoldersState {
  readonly folders: ReadonlyArray<string>
  readonly assignments: Readonly<Record<string, string>>
  readonly collapsedFolders: ReadonlyArray<string>
}

export const EmptyRepositoryFoldersState: IRepositoryFoldersState = {
  folders: [],
  assignments: {},
  collapsedFolders: [],
}

const getRepositoryKey = (repository: Repository) => {
  const path = Path.resolve(repository.path)
  return __WIN32__ ? path.toLowerCase() : path
}

const getCanonicalFolderName = (
  folders: ReadonlyArray<string>,
  name: string
) => {
  const normalizedName = name.trim().toLowerCase()
  return folders.find(folder => folder.toLowerCase() === normalizedName) ?? null
}

export function loadRepositoryFolders(): IRepositoryFoldersState {
  return (
    getObject<IRepositoryFoldersState>(RepositoryFoldersStorageKey) ??
    EmptyRepositoryFoldersState
  )
}

export function saveRepositoryFolders(state: IRepositoryFoldersState) {
  setObject(RepositoryFoldersStorageKey, state)
}

export function getRepositoryFolder(
  state: IRepositoryFoldersState,
  repository: Repository
): string | null {
  return state.assignments[getRepositoryKey(repository)] ?? null
}

export function createRepositoryFolder(
  state: IRepositoryFoldersState,
  name: string
): IRepositoryFoldersState {
  const folderName = name.trim()

  if (
    folderName.length === 0 ||
    getCanonicalFolderName(state.folders, folderName) !== null
  ) {
    return state
  }

  return { ...state, folders: [...state.folders, folderName] }
}

export function assignRepositoryFolder(
  state: IRepositoryFoldersState,
  repository: Repository,
  folder: string | null
): IRepositoryFoldersState {
  const repositoryKey = getRepositoryKey(repository)

  if (folder === null) {
    const assignments = { ...state.assignments }
    delete assignments[repositoryKey]
    return { ...state, assignments }
  }

  const canonicalName = getCanonicalFolderName(state.folders, folder)
  if (canonicalName === null) {
    return state
  }

  return {
    ...state,
    assignments: { ...state.assignments, [repositoryKey]: canonicalName },
  }
}

export function renameRepositoryFolder(
  state: IRepositoryFoldersState,
  currentName: string,
  newName: string
): IRepositoryFoldersState {
  const canonicalCurrentName = getCanonicalFolderName(
    state.folders,
    currentName
  )
  const folderName = newName.trim()
  const existingName = getCanonicalFolderName(state.folders, folderName)

  if (
    canonicalCurrentName === null ||
    folderName.length === 0 ||
    (existingName !== null && existingName !== canonicalCurrentName)
  ) {
    return state
  }

  const rename = (folder: string) =>
    folder === canonicalCurrentName ? folderName : folder

  return {
    folders: state.folders.map(rename),
    assignments: Object.fromEntries(
      Object.entries(state.assignments).map(([repositoryKey, folder]) => [
        repositoryKey,
        rename(folder),
      ])
    ),
    collapsedFolders: state.collapsedFolders.map(rename),
  }
}

export function deleteRepositoryFolder(
  state: IRepositoryFoldersState,
  name: string
): IRepositoryFoldersState {
  const canonicalName = getCanonicalFolderName(state.folders, name)

  if (canonicalName === null) {
    return state
  }

  return {
    folders: state.folders.filter(folder => folder !== canonicalName),
    assignments: Object.fromEntries(
      Object.entries(state.assignments).filter(
        ([, folder]) => folder !== canonicalName
      )
    ),
    collapsedFolders: state.collapsedFolders.filter(
      folder => folder !== canonicalName
    ),
  }
}

export function toggleRepositoryFolder(
  state: IRepositoryFoldersState,
  name: string
): IRepositoryFoldersState {
  const canonicalName = getCanonicalFolderName(state.folders, name)

  if (canonicalName === null) {
    return state
  }

  return {
    ...state,
    collapsedFolders: state.collapsedFolders.includes(canonicalName)
      ? state.collapsedFolders.filter(folder => folder !== canonicalName)
      : [...state.collapsedFolders, canonicalName],
  }
}
