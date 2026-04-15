/** OpenAI 응답 및 UI — 등기사항전부증명서+건축물대장 통합 PDF 분리 추출 */

import type { MaybeSourced, Sourced } from "@/lib/sourcedField";

export type RegistryParcelType = "토지" | "건물";

/** 토지 등기 단위 basic_info (도로명주소는 토지 표제부에 없음 — 키를 넣지 않음) */
export type LandParcelBasicInfo = {
  지목?: string | null;
  면적?: string | null;
  용도지역?: string | null;
  [key: string]: unknown;
};

/** 건물 등기 단위 basic_info (도로명주소는 건물 표제부·대장에서만) */
export type BuildingParcelBasicInfo = {
  구조?: string | null;
  지붕?: string | null;
  용도?: string | null;
  층수?: string | null;
  연면적?: string | null;
  도로명주소?: string | null;
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
  주용도?: string | null;
  주구조?: string | null;
  층수?: string | null;
  용도지역?: string | null;
  위반건축물?: string | null;
  사용승인일?: string | null;
  동별내역?: 동별내역행[] | null;
  변동사항?: string[] | null;
  [key: string]: unknown;
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

/** 토지이용계획확인서 추출 블록 (원본 하이라이트용 *_anchor 동반) */
export type LandUsePlanBlock = {
  소재지?: string | null;
  지번?: string | null;
  지목?: string | null;
  면적?: string | null;
  국토계획법_용도지역?: string | null;
  지구단위계획구역_여부?: boolean | null;
  기타_법령_지역지구?: string | null;
  기타_사항?: string | null;
  [key: string]: unknown;
};

/** 토지대장 (원본 하이라이트용 *_anchor) */
export type LandRegisterBlock = {
  토지소재?: string | null;
  지번?: string | null;
  지목?: string | null;
  면적?: string | null;
  소유자명?: string | null;
  소유자주소?: string | null;
  소유권변동일?: string | null;
  소유권변동원인?: string | null;
  개별공시지가?: string | null;
  개별공시지가기준일?: string | null;
  [key: string]: unknown;
};

export type JointOwnershipShareRow = {
  순번?: string | null;
  변동일자?: string | null;
  변동원인?: string | null;
  소유권지분?: string | null;
  성명?: string | null;
  주소?: string | null;
  등록번호?: string | null;
  [key: string]: unknown;
};

export type JointOwnershipBlock = {
  토지소재?: string | null;
  지번?: string | null;
  공유자목록?: JointOwnershipShareRow[] | null;
  [key: string]: unknown;
};

/** 지적도 vision 분석 결과 */
export type CadastralMapBlock = {
  대상지번?: string | null;
  인접지번목록?: string[] | null;
  도로접면?: string | null;
  형상?: string | null;
  맹지여부?: boolean | null;
  특이사항?: string | null;
  [key: string]: unknown;
};

export type AnalysisResult = {
  parcels: RegistryParcel[];
  building_registry?: BuildingRegistryBlock | null;
  /** PDF에 토지이용계획확인서가 없으면 null */
  land_use_plan?: LandUsePlanBlock | null;
  land_register?: LandRegisterBlock | null;
  joint_ownership?: JointOwnershipBlock | null;
  /** 지적도 이미지는 vision API로 채움. 없으면 null */
  cadastral_map?: CadastralMapBlock | null;
  summary?: AnalysisSummaryBlock | null;
};

export type { MaybeSourced, Sourced };
