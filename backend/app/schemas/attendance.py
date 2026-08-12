from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from backend.app.models.attendance import AttendanceStatus


class DepartmentBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    is_active: bool = True


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class DepartmentRead(DepartmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_count: int = 0
    created_at: datetime
    updated_at: datetime


class EmployeeBase(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    position: str | None = None
    department: str | None = None
    department_id: int | None = None
    badge_number: str | None = None
    scheduled_check_in: time = time(9, 0)
    is_active: bool = True
    user_id: int | None = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    position: str | None = None
    department: str | None = None
    department_id: int | None = None
    badge_number: str | None = None
    scheduled_check_in: time | None = None
    is_active: bool | None = None
    user_id: int | None = None


class EmployeeRead(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    telegram_chat_id: str | None = None
    created_at: datetime
    updated_at: datetime


class TelegramPairingResponse(BaseModel):
    code: str
    deep_link: str
    expires_at: datetime


class AttendanceRecordUpsert(BaseModel):
    employee_id: int
    work_date: date
    check_in_time: time | None = None
    check_out_time: time | None = None
    status: AttendanceStatus | None = None
    early_leave: bool = False
    disciplinary_violation: bool = False
    absence_hours: Decimal = Decimal("0")
    note: str | None = None


class AttendanceRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    work_date: date
    check_in_time: time | None = None
    check_out_time: time | None = None
    status: AttendanceStatus
    late_minutes: int
    early_leave: bool
    disciplinary_violation: bool
    absence_hours: Decimal
    note: str | None = None


class AttendanceDayCell(BaseModel):
    check_in_time: time | None = None
    check_out_time: time | None = None
    status: AttendanceStatus
    late_minutes: int = 0
    early_leave: bool = False
    disciplinary_violation: bool = False
    absence_hours: Decimal = Decimal("0")
    note: str | None = None
    band: str = "no_data"


class AttendanceMonthlySummary(BaseModel):
    late_days: int
    total_late_minutes: int
    absence_days: int
    absence_hours: Decimal
    early_leave_count: int
    disciplinary_count: int
    score: Decimal
    grade: str


class AttendanceEmployeeRow(BaseModel):
    id: int
    full_name: str
    position: str | None = None
    scheduled_check_in: time
    days: dict[str, AttendanceDayCell]
    summary: AttendanceMonthlySummary


class AttendanceDepartmentGroup(BaseModel):
    name: str
    employees: list[AttendanceEmployeeRow]


class AttendanceAnalysisEntry(BaseModel):
    employee_id: int
    full_name: str
    value: Decimal


class AttendanceMonthlyAnalysis(BaseModel):
    total_employees: int
    total_late_events: int
    total_absence_days: int
    most_late_employees: list[AttendanceAnalysisEntry]
    best_employees: list[AttendanceAnalysisEntry]
    worst_employees: list[AttendanceAnalysisEntry]


class AttendanceGrid(BaseModel):
    year: int
    month: int
    days: list[int]
    day_labels: list[str]
    departments: list[AttendanceDepartmentGroup]
    analysis: AttendanceMonthlyAnalysis


class AttendanceImportResult(BaseModel):
    rows_processed: int
    rows_matched: int
    rows_skipped: int
    warnings: list[str]


class HikvisionDeviceStatus(BaseModel):
    host: str
    reachable: bool
    device_user_count: int | None = None
    error: str | None = None


class HikvisionSyncLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    synced_at: datetime
    device_users_seen: int
    employees_created: int
    events_fetched: int
    days_updated: int
    warnings_count: int


class HikvisionStatus(BaseModel):
    configured: bool
    devices: list[HikvisionDeviceStatus] = []
    last_sync: HikvisionSyncLogRead | None = None


class HikvisionEmployeeSyncResult(BaseModel):
    device_users: int
    created: int
    already_existing: int
    created_names: list[str]
    warnings: list[str] = []


class HikvisionEventSyncResult(BaseModel):
    events_fetched: int
    days_updated: int
    matched_employees: int
    warnings: list[str]


class HikvisionAgentSyncRequest(BaseModel):
    device_users: list[dict] = []
    events: list[dict] = []


class HikvisionAgentSyncResult(BaseModel):
    employees: HikvisionEmployeeSyncResult
    events: HikvisionEventSyncResult
