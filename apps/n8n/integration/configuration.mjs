// The first supported setting is n8n's native hourly schedule. This is not a
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
    intervals[0].field !== "hours"
  ) {
    throw new Error("Template configuration requires one native hourly schedule");
  }
  validateHours(intervals[0].hoursInterval);
  return { hoursInterval: intervals[0].hoursInterval, minimum: 1, maximum: 168 };
}

function validateHours(value) {
  if (!Number.isInteger(value) || value < 1 || value > 168) {
    throw new AutomationConfigurationError("Choose a whole number of hours from 1 to 168");
  }
}

export function configureWorkflow(template, workflow, settings = {}) {
  if (!settings || Array.isArray(settings) || typeof settings !== "object") {
    throw new AutomationConfigurationError("Invalid automation settings");
  }
  const schedule = scheduleConfiguration(template);
  const allowed = schedule ? ["hoursInterval"] : [];
  if (Object.keys(settings).some((key) => !allowed.includes(key)))
    throw new AutomationConfigurationError("Unknown automation setting");
  if (!schedule) return workflow;
  const hours = Object.hasOwn(settings, "hoursInterval") ? settings.hoursInterval : schedule.hoursInterval;
  validateHours(hours);
  const node = workflow.nodes.find((candidate) => candidate.id === template.configuration.scheduleNode);
  node.parameters.rule.interval[0].hoursInterval = hours;
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
