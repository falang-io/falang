import { checker, TOKEN_SCHEME, useService, type IBlockView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';

export const ContourFunctionFooterBlockComponent: IBlockView<string> = observer(({ data }) => {
  const scheme = useService(TOKEN_SCHEME);
  const rootIcon = scheme.rootIcon;
  if (!checker.isContour(rootIcon)) return null;
  const foundIcon = [...rootIcon.body.threads.icons, rootIcon.finish].find((icon) => icon.id === data);
  const displayData = String(foundIcon?.dataNode.data ?? '&nbsp;');
  return <div dangerouslySetInnerHTML={{ __html: displayData }} />;
});
