using npv as npv from '../db/schema';

service NPVService {
  @Capabilities.Insertable
  entity Projects as projection on npv.Project;
  entity Configurations as projection on npv.Configuration;
  entity PeriodRelations as projection on npv.PeriodRelation;
}
