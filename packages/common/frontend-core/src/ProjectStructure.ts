export interface IDirectory {
  name: string
  path: string
  directories: IDirectory[]
  files: IFile[]
}

export interface IFile {
  name: string
  path: string
  type: string
  id: string
}