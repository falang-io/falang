import React from 'react';

export const TsSelect: React.FC<
  React.DetailedHTMLProps<React.SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement>
> = (props) => (
  <div className="ts-select-wrapper">
    <select className="ts-select" {...props} />
  </div>
);
