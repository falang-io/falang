export interface ITextEditorComponentParams {
  value: string
  id: string
  style: React.CSSProperties
  onChange: (value: string) => void
  onClose: () => void
}

export const TextEditorComponent: React.FC<ITextEditorComponentParams> = ({ value, id, style, onChange, onClose }) => {
  return <textarea
    id={id}
    className="text-editor"
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {
      if (e.ctrlKey && e.keyCode === 13) {
        onClose();
      }
      e.stopPropagation();
    }}
    onMouseUp={(e) => {
      e.stopPropagation();
    }}
    onMouseDown={(e) => {
      e.stopPropagation();
    }}
    onMouseMove={(e) => {
      e.stopPropagation();
    }}
    style={style}
    onClick={(e) => {
      e.stopPropagation();
    }}
    value={value}
  />
}