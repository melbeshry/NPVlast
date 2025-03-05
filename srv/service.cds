using npv as npv from '../db/schema';

service NPVService {
  entity Configurations as projection on npv.Configuration;
  entity Periods as projection on npv.Period;
  entity Percentages as projection on npv.Percentage;
}
