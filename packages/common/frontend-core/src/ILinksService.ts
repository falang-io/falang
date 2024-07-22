export interface ILinkInfo {
  id: string
  path: string
  text: string
  color: string
}

export interface ILinksService {
  getLinksOptions: (projectRoot: string) => Promise<ILinkInfo[]>
  getLinkInfo: (projectRoot: string, id: string) => Promise<ILinkInfo>
  linkClicked: (id: string) => void
};