/** OpenAI 응답 및 UI — 등기사항전부증명서+건축물대장 통합 PDF 분리 추출 */

import type { MaybeSourced, Sourced } from "@/lib/sourcedField";

export type RegistryParcelType = "토지" | "건물";

/** 토지 등기 단위 basic_info */
export type LandParcelBasicInfo = {
  지목?: string | null;
  면적?: string | null;
  도로명주소?: string | null;
  용도지역?: string | null;
  [key: string]: unknown;
};

/** 건물 등기 단위 basic_info */
export type BuildingParcelBasicInfo = {
  구조?: string | null;
  지붕?: string | null;
  용도?: string | null;
  층수?: string | null;
  연면적?: string | null;
  [key: string]: unknown;
};

export type 이전이력항목 = {
  날짜?: string | null;
  원인?: string | null;
  거래가액?: string | null;
};

export type 근저당권행 = {
  상태?: string | null;
  채권최고액?: string | null;
  채권자?: string | null;
  채무자?: string | null;
  설정일?: string | null;
};

export type RegistryOwnership = {
  소유자명?: string | null;
  소유형태?: string | null;
  지분현황?: string | null;
  최근이전일?: string | null;
  이전원인?: string | null;
  거래가액?: string | null;
  /** 최근 3회 등 권장 */
  이전이력?: 이전이력항목[] | null;
};

export type RegistryRights = {
  근저당권?: 근저당권행[] | null;
  지상권?: string | null;
  압류가압류?: string | null;
};

export type RegistryParcel = {
  type: RegistryParcelType;
  address: string;
  basic_info: Record<string, unknown>;
  ownership: RegistryOwnership;
  rights: RegistryRights;
  special_notes?: string[];
};

export type 동별내역행 = {
  동?: string | null;
  구조?: string | null;
  용도?: string | null;
  연면적?: string | null;
  [key: string]: unknown;
};

export type BuildingRegistryBlock = {
  대지면적?: string | null;
  총연면적?: string | null;
  건폐율?: string | null;
  용적률?: string | null;
  용도지역?: string | null;
  위반건축물?: string | null;
  사용승인일?: string | null;
  동별내역?: 동별내역행[] | null;
  변동사항?: string[] | null;
};

export type AnalysisSummaryBlock = {
  총_토지_필지수?: number | null;
  총_토지_면적?: string | null;
  총_건물_동수?: number | null;
  총_건물_연면적?: string | null;
  건축물대장_대지면적?: string | null;
  토지면적_대장면적_일치?: boolean | null;
  건물등기_연면적_대장_일치?: boolean | null;
  전체_소유자_일치?: boolean | null;
  소유자?: string | null;
};

export type AnalysisResult = {
  parcels: RegistryParcel[];
  building_registry?: BuildingRegistryBlock | null;
  summary?: AnalysisSummaryBlock | null;
};

export type { MaybeSourced, Sourced };
