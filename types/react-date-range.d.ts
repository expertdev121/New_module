declare module 'react-date-range' {
  export interface Range {
    startDate?: Date;
    endDate?: Date;
    key?: string;
  }

  export interface RangeKeyDict {
    [key: string]: Range;
  }

  export interface DateRangePickerProps {
    onChange: (ranges: RangeKeyDict) => void;
    showSelectionPreview?: boolean;
    moveRangeOnFirstSelection?: boolean;
    months?: number;
    ranges?: Range[];
    direction?: 'vertical' | 'horizontal';
    className?: string;
  }

  export const DateRangePicker: React.ComponentType<DateRangePickerProps>;
}
