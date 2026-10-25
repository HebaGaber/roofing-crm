// Shared display formatters for every CRM screen (Map, Leads, Ask). Raw contract values — ISO
// timestamps, enum codes, column names — go through these before they reach the screen.
export { formatDate, formatDateTimeUtc } from "./date.js";
export {
  COORDINATE_SOURCE_LABELS,
  ROOF_AGE_BASIS_LABELS,
  ROOF_AGE_CONFIDENCE_LABELS,
  contractorResolutionLabel,
  coordinateSourceLabel,
  humanizeCode,
  permitStatusLabel,
  permitStatusShortLabel,
  propertyKind,
  roofAgeBasisLabel,
  roofAgeConfidenceLabel,
  roofAgeGapLabel,
  roofAgeText,
  type PropertyKind,
} from "./labels.js";
export {
  FIELD_LABELS,
  fieldLabel,
  fieldList,
  groupMissing,
  missingReasonText,
  type MissingGroup,
} from "./fields.js";
export {
  ROOF_AGE_BUCKETS,
  PERMIT_OPEN_BUCKETS,
  roofAgeBucket,
  permitOpenBucket,
  type RoofAgeBucket,
  type PermitOpenBucket,
} from "./buckets.js";
