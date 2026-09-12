// Supported settings are n8n's native minute and hour schedules. This is not a
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
    !["hours", "minutes"].includes(intervals[0].field)
  ) {
    throw new Error("Template configuration requires one native minute or hour schedule");
  }
  if (intervals[0].field === "minutes") {
    validateMinutes(intervals[0].minutesInterval);
    return { minutesInterval: intervals[0].minutesInterval, minimum: 1, maximum: 60 };
  }
  const dailyReport = ["research-digest", "reference-audit", "bibliography"].includes(template.research);
  const maximum = dailyReport ? 24 : 168;
  validateHours(intervals[0].hoursInterval, maximum);
  return { hoursInterval: intervals[0].hoursInterval, minimum: 1, maximum };
}

function validateHours(value, maximum = 168) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new AutomationConfigurationError(`Choose a whole number of hours from 1 to ${maximum}`);
  }
}

function validateMinutes(value) {
  if (!Number.isInteger(value) || value < 1 || value > 60) {
    throw new AutomationConfigurationError("Choose a whole number of minutes from 1 to 60");
  }
}

export function configureWorkflow(template, workflow, settings = {}) {
  if (!settings || Array.isArray(settings) || typeof settings !== "object") {
    throw new AutomationConfigurationError("Invalid automation settings");
  }
  const schedule = scheduleConfiguration(template);
  const setting = schedule?.minutesInterval === undefined ? "hoursInterval" : "minutesInterval";
  const allowed = schedule ? [setting] : [];
  if (template.research) allowed.push("research");
  if (Object.keys(settings).some((key) => !allowed.includes(key)))
    throw new AutomationConfigurationError("Unknown automation setting");
  if (!schedule) return workflow;
  const value = Object.hasOwn(settings, setting) ? settings[setting] : schedule[setting];
  if (setting === "minutesInterval") validateMinutes(value);
  else validateHours(value, schedule.maximum);
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
