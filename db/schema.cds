namespace npv;
using { managed } from '@sap/cds/common';

entity Project: managed {
    key projectId : String(10);  // e.g., 'MQR', 'MQ', 'MW', 'MWV', 'MPE'
}

@source: 'csv/projects.csv'
entity ProjectData : Project {}

entity Configuration: managed {
    key ID : UUID;
    project : Association to Project;
    frequency : String(10);  // e.g., 'Annual', 'Monthly', etc.
    periods : Composition of many PeriodRelation on periods.config = $self;
}

entity PeriodRelation {
    key ID : UUID;
    config : Association to Configuration;
    orig_period : String(20);  // Column header (e.g., 1YP, 2YP)
    rel_period : String(20);  // Row header (e.g., delivery, downpayment, 1YP)
    value : Decimal(5,2);     // Percentage value (e.g., 0.00 to 100.00)
}