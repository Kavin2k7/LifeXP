<?php
declare(strict_types=1);

loadEnvironment();
date_default_timezone_set(getenv('APP_TIMEZONE') ?: 'UTC');

const API_JSON_FLAGS = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;

function loadEnvironment(): void
{
    $file = __DIR__ . '/../.env';
    if (!is_file($file) || !is_readable($file)) {
        return;
    }
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim(trim($value), "\"'");
        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $host = getenv('DB_HOST') ?: '127.0.0.1';
    $port = getenv('DB_PORT') ?: '3306';
    $name = getenv('DB_NAME') ?: 'lifexp';
    $user = getenv('DB_USER') ?: 'root';
    $password = getenv('DB_PASSWORD') ?: '';
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function respond(mixed $data = null, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $payload = ['data' => $data];
    if (isset($_SESSION['csrf_token'])) {
        $payload['csrfToken'] = $_SESSION['csrf_token'];
    }
    echo json_encode($payload, API_JSON_FLAGS);
    exit;
}

function fail(string $message, int $status = 400): never
{
    respond(['error' => $message], $status);
}

function body(): array
{
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > 1_048_576) {
        fail('Request body is too large.', 413);
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > 1_048_576) {
        fail('Request body is too large.', 413);
    }
    if ($raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        fail('Request body must be valid JSON.');
    }
    return $decoded;
}

function startApiSession(): void
{
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    $secure = filter_var(getenv('SESSION_SECURE') ?: 'false', FILTER_VALIDATE_BOOLEAN)
        || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();

    $origin = getenv('APP_ORIGIN') ?: 'http://localhost:5173';
    $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($requestOrigin !== '' && hash_equals($origin, $requestOrigin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    } elseif ($requestOrigin !== '') {
        fail('Origin is not allowed.', 403);
    }
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Cache-Control: no-store');
}

function csrfGuard(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!isset($_SESSION['csrf_token']) || !is_string($token) || !hash_equals($_SESSION['csrf_token'], $token)) {
        fail('Your session token expired. Refresh and try again.', 419);
    }
}

function currentUser(PDO $pdo, bool $required = true): ?array
{
    $id = $_SESSION['user_id'] ?? null;
    if (!$id) {
        if ($required) {
            fail('Please log in to continue.', 401);
        }
        return null;
    }
    $stmt = $pdo->prepare('SELECT id, name, email, role, is_active, total_xp, coins, level, current_streak, best_streak, last_completed_on FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user || !(bool)$user['is_active']) {
        $_SESSION = [];
        session_regenerate_id(true);
        if ($required) {
            fail('This account is unavailable. Please contact an administrator.', 403);
        }
        return null;
    }
    return $user;
}

function requireAdmin(array $user): void
{
    if ($user['role'] !== 'admin') {
        fail('Administrator access is required.', 403);
    }
}
