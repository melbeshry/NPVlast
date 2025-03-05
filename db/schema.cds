namespace npv;
    using {
        managed
    }from '@sap/cds/common';

entity Configuration: managed {
  key ID : UUID;
  frequency : String(10);  // e.g., 'Annual', 'Monthly', etc.
  periods : Composition of many Period on periods.config = $self;
}

entity Period: managed {
  key config : Association to Configuration;
  key periodName : String(20);  // e.g., 'First 4 Months', '1YP', etc.
  percentages : Composition of many Percentage on percentages.period = $self;
}

entity Percentage: managed {
  key period : Association to Period;
  key index : Integer;  // To identify each percentage input within a period
  value : Decimal(5,2);  // Percentage value, e.g., 25.00
}