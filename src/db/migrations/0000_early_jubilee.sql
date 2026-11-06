CREATE TABLE `action_events` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`run_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`policy_check_id` text,
	`step` integer NOT NULL,
	`tool_name` text NOT NULL,
	`args_summary` text NOT NULL,
	`phase` text NOT NULL,
	`verdict` text,
	`policy_rule_id` text,
	`agent_proposed` integer NOT NULL,
	`run_mode` text NOT NULL,
	`mock_result` text,
	`error_message` text,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`scenario_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`rules` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`run_mode` text NOT NULL,
	`metadata` text NOT NULL,
	`policy_snapshot` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text
);
