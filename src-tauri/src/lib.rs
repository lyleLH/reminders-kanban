use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;


#[derive(Serialize, Deserialize, Clone)]
struct Reminder {
    id: String,
    title: String,
    notes: String,
    status: String,
    completed: bool,
    list: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    flagged: Option<bool>,
    #[serde(rename = "priorityValue", skip_serializing_if = "Option::is_none")]
    priority_value: Option<i32>,
    #[serde(rename = "dueDate", skip_serializing_if = "Option::is_none")]
    due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    emoji: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct ReminderList {
    name: String,
    color: Option<String>,
}

struct HelperProcess {
    child: Child,
    stdin: std::process::ChildStdin,
    reader: BufReader<std::process::ChildStdout>,
}

impl HelperProcess {
    fn send(&mut self, cmd: &serde_json::Value) -> Result<serde_json::Value, String> {
        let action = cmd.get("action").and_then(|v| v.as_str()).unwrap_or("?");
        let t0 = std::time::Instant::now();

        let line = serde_json::to_string(cmd).map_err(|e| e.to_string())?;
        self.stdin
            .write_all(line.as_bytes())
            .map_err(|e| format!("write to helper: {}", e))?;
        self.stdin
            .write_all(b"\n")
            .map_err(|e| format!("write newline: {}", e))?;
        self.stdin.flush().map_err(|e| format!("flush: {}", e))?;

        let mut buf = String::new();
        self.reader
            .read_line(&mut buf)
            .map_err(|e| format!("read from helper: {}", e))?;

        let elapsed = t0.elapsed();
        eprintln!("[helper] {} → {}ms ({}B)", action, elapsed.as_millis(), buf.len());

        if buf.is_empty() {
            return Err("helper process closed unexpectedly".into());
        }

        serde_json::from_str(buf.trim()).map_err(|e| format!("JSON parse: {} (raw: {})", e, buf.trim()))
    }
}

impl Drop for HelperProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

fn helper_path() -> PathBuf {
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("swift-helper")
        .join("reminders-helper");
    if dev_path.exists() {
        return dev_path;
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(resources) = exe.parent().and_then(|p| p.parent()).map(|p| p.join("Resources")) {
            let bundle_path = resources.join("reminders-helper");
            if bundle_path.exists() {
                return bundle_path;
            }
        }
    }
    PathBuf::from("reminders-helper")
}

fn spawn_helper() -> Result<HelperProcess, String> {
    let path = helper_path();
    let mut child = Command::new(&path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn helper at {:?}: {}", path, e))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut reader = BufReader::new(stdout);

    // Wait for ready signal
    let mut ready_line = String::new();
    reader
        .read_line(&mut ready_line)
        .map_err(|e| format!("read ready: {}", e))?;

    let ready: serde_json::Value =
        serde_json::from_str(ready_line.trim()).map_err(|e| format!("parse ready: {}", e))?;

    if ready.get("ready").and_then(|v| v.as_bool()) != Some(true) {
        if let Some(err) = ready.get("error").and_then(|v| v.as_str()) {
            return Err(format!("helper error: {}", err));
        }
        return Err(format!("unexpected ready: {}", ready_line.trim()));
    }

    Ok(HelperProcess {
        child,
        stdin,
        reader,
    })
}

fn send_cmd(
    state: &tauri::State<'_, Mutex<HelperProcess>>,
    cmd: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let action = cmd.get("action").and_then(|v| v.as_str()).unwrap_or("?").to_string();
    let lock_t = std::time::Instant::now();
    let mut helper = state.lock().map_err(|e| format!("lock: {}", e))?;
    let lock_ms = lock_t.elapsed().as_millis();
    if lock_ms > 5 {
        eprintln!("[send_cmd] {} waited {}ms for lock", action, lock_ms);
    }
    let result = helper.send(&cmd);

    // If helper died, try respawning once
    if result.is_err() {
        drop(helper);
        let mut new_helper = spawn_helper()?;
        let retry = new_helper.send(&cmd);
        *state.lock().map_err(|e| format!("lock: {}", e))? = new_helper;
        return retry;
    }

    result
}

fn check_error(val: &serde_json::Value) -> Result<(), String> {
    if let Some(err) = val.get("error").and_then(|v| v.as_str()) {
        return Err(err.to_string());
    }
    Ok(())
}

#[tauri::command]
fn get_lists(state: tauri::State<'_, Mutex<HelperProcess>>) -> Result<Vec<ReminderList>, String> {
    let val = send_cmd(&state, serde_json::json!({"action": "lists"}))?;
    check_error(&val)?;
    serde_json::from_value(val).map_err(|e| format!("parse lists: {}", e))
}

#[tauri::command]
fn get_reminders(
    list: String,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<Vec<Reminder>, String> {
    let val = send_cmd(&state, serde_json::json!({"action": "list", "name": list}))?;
    check_error(&val)?;
    serde_json::from_value(val).map_err(|e| format!("parse reminders: {}", e))
}

#[tauri::command]
fn add_reminder(
    list: String,
    title: String,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<serde_json::Value, String> {
    let val = send_cmd(
        &state,
        serde_json::json!({"action": "add", "list": list, "title": title}),
    )?;
    check_error(&val)?;
    Ok(val)
}

#[tauri::command]
fn set_status(
    id: String,
    status: String,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<serde_json::Value, String> {
    let val = send_cmd(
        &state,
        serde_json::json!({"action": "set-status", "id": id, "status": status}),
    )?;
    check_error(&val)?;
    Ok(val)
}

#[tauri::command]
fn complete_reminder(
    id: String,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<serde_json::Value, String> {
    let val = send_cmd(
        &state,
        serde_json::json!({"action": "complete", "id": id}),
    )?;
    check_error(&val)?;
    Ok(val)
}

#[tauri::command]
fn update_field(
    id: String,
    field: String,
    value: String,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<serde_json::Value, String> {
    let val = send_cmd(
        &state,
        serde_json::json!({"action": "update", "id": id, "field": field, "value": value}),
    )?;
    check_error(&val)?;
    Ok(val)
}

#[tauri::command]
fn create_list(
    name: String,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<serde_json::Value, String> {
    let val = send_cmd(
        &state,
        serde_json::json!({"action": "create-list", "name": name}),
    )?;
    check_error(&val)?;
    Ok(val)
}

#[tauri::command]
fn delete_list(
    name: String,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<serde_json::Value, String> {
    let val = send_cmd(
        &state,
        serde_json::json!({"action": "delete-list", "name": name}),
    )?;
    check_error(&val)?;
    Ok(val)
}

#[tauri::command]
fn rename_list(
    old_name: String,
    new_name: String,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<serde_json::Value, String> {
    let val = send_cmd(
        &state,
        serde_json::json!({"action": "rename-list", "oldName": old_name, "newName": new_name}),
    )?;
    check_error(&val)?;
    Ok(val)
}

#[tauri::command]
fn delete_reminder(
    id: String,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<serde_json::Value, String> {
    let val = send_cmd(
        &state,
        serde_json::json!({"action": "delete", "id": id}),
    )?;
    check_error(&val)?;
    Ok(val)
}

#[tauri::command]
fn set_priority(
    id: String,
    value: i32,
    state: tauri::State<'_, Mutex<HelperProcess>>,
) -> Result<serde_json::Value, String> {
    let val = send_cmd(
        &state,
        serde_json::json!({"action": "set-priority", "id": id, "value": value}),
    )?;
    check_error(&val)?;
    Ok(val)
}

pub fn run() {
    let helper = spawn_helper().expect("Failed to start reminders helper");

    tauri::Builder::default()
        .manage(Mutex::new(helper))
        .invoke_handler(tauri::generate_handler![
            get_lists,
            get_reminders,
            add_reminder,
            set_status,
            complete_reminder,
            update_field,
            create_list,
            set_priority,
            delete_reminder,
            rename_list,
            delete_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
