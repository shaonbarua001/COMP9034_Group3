export var ContractType;
(function (ContractType) {
    ContractType["Casual"] = "casual";
    ContractType["PartTime"] = "part_time";
    ContractType["FullTime"] = "full_time";
})(ContractType || (ContractType = {}));
export var IdentityMethodType;
(function (IdentityMethodType) {
    IdentityMethodType["Card"] = "card";
    IdentityMethodType["Face"] = "face";
    IdentityMethodType["Fingerprint"] = "fingerprint";
    IdentityMethodType["Retinal"] = "retinal";
})(IdentityMethodType || (IdentityMethodType = {}));
export var TimeEventType;
(function (TimeEventType) {
    TimeEventType["ClockIn"] = "clock_in";
    TimeEventType["ClockOut"] = "clock_out";
    TimeEventType["BreakStart"] = "break_start";
    TimeEventType["BreakEnd"] = "break_end";
})(TimeEventType || (TimeEventType = {}));
export var ExceptionType;
(function (ExceptionType) {
    ExceptionType["MissingClockOut"] = "missing_clock_out";
    ExceptionType["NoBreakOver4Hours"] = "no_break_over_4_hours";
    ExceptionType["UnrosteredAttempt"] = "unrostered_attempt";
})(ExceptionType || (ExceptionType = {}));
export var PayRunStatus;
(function (PayRunStatus) {
    PayRunStatus["Draft"] = "draft";
    PayRunStatus["Finalized"] = "finalized";
})(PayRunStatus || (PayRunStatus = {}));
export var UserRole;
(function (UserRole) {
    UserRole["Admin"] = "admin";
    UserRole["Staff"] = "staff";
})(UserRole || (UserRole = {}));
