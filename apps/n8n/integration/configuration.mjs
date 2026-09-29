// Supported settings are n8n's native minute, hour and day schedules. This is not a
// parameter-path language: reviewed templates identify the one schedule node.
export class AutomationConfigurationError extends Error {}

export function scheduleConfiguration(template) {
  if (template.configuration === undefined) return null;
  const configuration = template.configuration;
  if (!configuration || Object.keys(configuration).some((key) => key !== "scheduleNode")) {
    throw new Error("Unsupported template configuration");
  }
  const node = template.workflow.nodes.find((candidate) => candidate.id === configuration.scheduleNode);
  const intervals = node?.parameters?.rule?.interval;
  if (
    node?.type !== "n8n-nodes-base.scheduleTrigger" ||
    !Array.isArray(intervals) ||
    intervals.length !== 1 ||
    !["hours", "minutes", "days"].includes(intervals[0].field)
  ) {
    throw new Error("Template configuration requires one native minute, hour or day schedule");
  }
  if (intervals[0].field === "minutes") {
    validateMinutes(intervals[0].minutesInterval);
    return { minutesInterval: intervals[0].minutesInterval, minimum: 1, maximum: 59 };
  }
  if (intervals[0].field === "hours") {
    validateHours(intervals[0].hoursInterval);
    return { hoursInterval: intervals[0].hoursInterval, minimum: 1, maximum: 23 };
  }
  const dailyReport = ["research-digest", "reference-audit", "bibliography"].includes(template.research);
  const maximum = dailyReport ? 1 : 7;
  validateDays(intervals[0].daysInterval, maximum);
  return { daysInterval: intervals[0].daysInterval, minimum: 1, maximum };
}

function validateHours(value) {
  if (!Number.isInteger(value) || value < 1 || value > 23) {
    throw new AutomationConfigurationError("Choose a whole number of hours from 1 to 23");
  }
}

function validateMinutes(value) {
  if (!Number.isInteger(value) || value < 1 || value > 59) {
    throw new AutomationConfigurationError("Choose a whole number of minutes from 1 to 59");
  }
}

function validateDays(value, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new AutomationConfigurationError(`Choose a whole number of days from 1 to ${maximum}`);
  }
}

export function configureWorkflow(template, workflow, settings = {}) {
  if (!settings || Array.isArray(settings) || typeof settings !== "object") {
    throw new AutomationConfigurationError("Invalid automation settings");
  }
  const schedule = scheduleConfiguration(template);
  const setting = schedule
    ? ["minutesInterval", "hoursInterval", "daysInterval"].find((key) => key in schedule)
    : undefined;
  const allowed = schedule ? [setting] : [];
  if (template.research) allowed.push("research");
  if (Object.keys(settings).some((key) => !allowed.includes(key)))
    throw new AutomationConfigurationError("Unknown automation setting");
  if (!schedule) return workflow;
  const value = Object.hasOwn(settings, setting) ? settings[setting] : schedule[setting];
  if (setting === "minutesInterval") validateMinutes(value);
  else if (setting === "hoursInterval") validateHours(value);
  else validateDays(value, schedule.maximum);
  const node = workflow.nodes.find((candidate) => candidate.id === template.configuration.scheduleNode);
  node.parameters.rule.interval[0][setting] = value;
  return workflow;
}

export function workflowScheduleHours(template, workflow) {
  const node = workflow.nodes?.find((candidate) => candidate.id === template.configuration?.scheduleNode);
  const intervals = node?.parameters?.rule?.interval;
  if (node?.type !== "n8n-nodes-base.scheduleTrigger" || !Array.isArray(intervals) || intervals.length !== 1)
    return null;
  const interval = intervals[0];
  if (interval.field !== "hours" || !Number.isInteger(interval.hoursInterval)) return null;
  return interval.hoursInterval;
}

export function workflowScheduleMinutes(template, workflow) {
  const node = workflow.nodes?.find((candidate) => candidate.id === template.configuration?.scheduleNode);
  const intervals = node?.parameters?.rule?.interval;
  if (node?.type !== "n8n-nodes-base.scheduleTrigger" || !Array.isArray(intervals) || intervals.length !== 1)
    return null;
  const interval = intervals[0];
  if (interval.field !== "minutes" || !Number.isInteger(interval.minutesInterval)) return null;
  return interval.minutesInterval;
}

export function workflowScheduleDays(template, workflow) {
  const node = workflow.nodes?.find((candidate) => candidate.id === template.configuration?.scheduleNode);
  const intervals = node?.parameters?.rule?.interval;
  if (node?.type !== "n8n-nodes-base.scheduleTrigger" || !Array.isArray(intervals) || intervals.length !== 1)
    return null;
  const interval = intervals[0];
  if (interval.field !== "days" || !Number.isInteger(interval.daysInterval)) return null;
  return interval.daysInterval;
}
