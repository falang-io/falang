import React from 'react';
import styled from '@emotion/styled';
import { CELL_SIZE } from '@falang/scheme';

const TypescriptContainerDiv = styled.div`
  input.ts-input {
    height: ${CELL_SIZE - 1}px;
    border: none;
    line-height: ${CELL_SIZE - 1}px;
    width: 100%;
    padding: 0 3px;
    box-sizing: border-box;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  input.ts-input:focus {
    outline: none;
  }
  .ts-input-value {
    height: ${CELL_SIZE - 1}px;
    border: none;
    line-height: ${CELL_SIZE - 1}px;
    width: 100%;
    padding: 0 3px;
    box-sizing: border-box;
    white-space: nowrap;
  }
  .ts-label {
    height: ${CELL_SIZE - 1}px;
    border: none;
    line-height: ${CELL_SIZE - 1}px;
    width: 100%;
    padding: 0 3px;
    box-sizing: border-box;
    white-space: nowrap;
  }
  select.ts-select {
    height: ${CELL_SIZE - 1}px;
    border: none;
    line-height: ${CELL_SIZE - 1}px;
    width: 100%;
    padding: 0 3px;
    box-sizing: border-box;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .ts-input-value {
    height: ${CELL_SIZE - 1}px;
    border: none;
    line-height: ${CELL_SIZE - 1}px;
    width: 100%;
    padding: 0 3px;
    box-sizing: border-box;
  }
  table.ts-table {
    border: 0px;
    padding: 0;
    margin: 0;
    border-collapse: collapse;
    width: 100%;
  }
  table.ts-table td {
    border: 0px;
    padding: 0;
    font: inherit;
    line-height: ${CELL_SIZE - 1}px;
    border-right: 1px solid rgba(128, 128, 128, 0.3);
    border-bottom: 1px solid rgba(128, 128, 128, 0.3);
  }
  table.ts-table td:last-child {
    border-right: none;
  }
  table.ts-table tr:last-child td {
    border-bottom: none;
  }
  /*
   * Opt-in modifier for editor tables holding a monaco-backed field (see expression-editor-cell.cmp.tsx).
   * Monaco's editing container renders at width: calc(100% + 20px), which — if the value cell's
   * content counted towards its auto-computed width — would grow the table without bound on every
   * keystroke. The value cell takes all the remaining width and max-width: 0 keeps its content out of
   * the column-width computation, so it clips monaco's intentional 20px overscan instead of growing;
   * the label column stays sized by its text, exactly as in the read-only view (a pinned label width
   * made longer labels run over the field).
   */
  table.ts-table--fixed td:first-child {
    white-space: nowrap;
  }
  table.ts-table--fixed td:last-child {
    width: 100%;
    max-width: 0;
    overflow: hidden;
  }
  .ts-select-wrapper {
    height: ${CELL_SIZE - 1}px;
    overflow: hidden;
  }
`;

export const TypeScriptBlockContainer: React.FC<React.PropsWithChildren> = ({ children }) => (
  <TypescriptContainerDiv>{children}</TypescriptContainerDiv>
);
