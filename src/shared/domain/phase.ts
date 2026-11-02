/**
 * Execution phase label (the "Fase" context of the original process). Rules with a phase only
 * run in executions of that phase; rules without phase run in every execution.
 */
export const PHASE_PATTERN = /^[\p{L}\p{N} _./-]{1,100}$/u;
