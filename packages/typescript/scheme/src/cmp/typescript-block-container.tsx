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
   * Opt-in modifier for rows holding a monaco-backed field (see expression-editor-cell.cmp.tsx).
   * Monaco's editing container renders at width: calc(100% + 20px), which — under the default
   * table-layout: auto — feeds back into the cell's own auto-computed width and grows the table
   * without bound on every keystroke. Fixing the layout and pinning the label column breaks that
   * feedback loop; the value cell clips monaco's intentional 20px overscan instead of growing.
   */
  table.ts-table--fixed {
    table-layout: fixed;
  }
  table.ts-table--fixed td:first-child {
    width: 56px;
  }
  table.ts-table--fixed td:last-child {
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
