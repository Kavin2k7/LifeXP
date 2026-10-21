<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/gamification.php';

startApiSession();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function validatedTaskRequest(array $input): array
{
    try {
        return validatedTask($input);
    } catch (InvalidArgumentException $error) {
        fail($error->getMessage(), 422);
    }
}

try {
    $pdo = db();
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = preg_replace('#^/api(?=/|$)#', '', $path);
    $path = '/' . trim($path, '/');
    $input = null;

    if ($path === '/auth/csrf' && $method === 'GET') {
        $_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));
        respond(null);
    }

    if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        csrfGuard();
        $input = body();
    }

    if ($path === '/auth/register' && $method === 'POST') {
        if (!is_string($input['name'] ?? null) || !is_string($input['email'] ?? null) || !is_string($input['password'] ?? null)) {
            fail('Name, email, and password must be text.', 422);
        }
        $name = trim($input['name']);
        $email = strtolower(trim($input['email']));
        $password = $input['password'];
        if (mb_strlen($name) < 2 || mb_strlen($name) > 80) {
            fail('Name must be between 2 and 80 characters.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            fail('Enter a valid email address.');
        }
        if (strlen($password) < 8 || strlen($password) > 72) {
            fail('Password must be between 8 and 72 characters.');
        }
        enforceAuthLimit($pdo, 'register');
        $pdo->beginTransaction();
        try {
            $insert = $pdo->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
            $insert->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int)$pdo->lastInsertId();
            $settings = $pdo->prepare('INSERT INTO user_settings (user_id) VALUES (?)');
            $settings->execute([$userId]);
            $pdo->commit();
        } catch (PDOException $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($error->getCode() === '23000') {
                fail('An account with this email already exists.', 409);
            }
            throw $error;
        }
        initializeSession($userId);
        respond(publicUser(currentUser($pdo)), 201);
    }

    if ($path === '/auth/login' && $method === 'POST') {
        enforceAuthLimit($pdo, 'login');
        if (!is_string($input['email'] ?? null) || !is_string($input['password'] ?? null)) {
            fail('Email and password must be text.', 422);
        }
        $email = strtolower(trim($input['email']));
        $password = $input['password'];
        $stmt = $pdo->prepare('SELECT id, password_hash, is_active FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $account = $stmt->fetch();
        if (!$account || !password_verify($password, $account['password_hash'])) {
            fail('Email or password is incorrect.', 401);
        }
        if (!(bool)$account['is_active']) {
            fail('This account is unavailable. Please contact an administrator.', 403);
        }
        initializeSession((int)$account['id']);
        respond(publicUser(currentUser($pdo)));
    }

    if ($path === '/auth/logout' && $method === 'POST') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => $params['samesite'],
            ]);
        }
        session_destroy();
        respond(['loggedOut' => true]);
    }

    if ($path === '/auth/me' && $method === 'GET') {
        $user = currentUser($pdo, false);
        respond($user ? publicUser($user) : null);
    }

    $user = currentUser($pdo);
    $userId = (int)$user['id'];

    if ($path === '/dashboard' && $method === 'GET') {
        respond(dashboardData($pdo, $user));
    }

    if ($path === '/tasks' && $method === 'GET') {
        $sql = 'SELECT id, title, description, category, difficulty, due_date, status, completed_at, created_at FROM tasks WHERE user_id = ? AND deleted_at IS NULL';
        $params = [$userId];
        foreach (['category' => 'category', 'difficulty' => 'difficulty'] as $queryKey => $column) {
            if (isset($_GET[$queryKey]) && $_GET[$queryKey] !== '') {
                $sql .= " AND {$column} = ?";
                $params[] = (string)$_GET[$queryKey];
            }
        }
        if (isset($_GET['status']) && in_array($_GET['status'], ['pending', 'completed'], true)) {
            $sql .= ' AND status = ?';
            $params[] = $_GET['status'];
        }
        if (!empty($_GET['date']) && validDate((string)$_GET['date'])) {
            $sql .= ' AND due_date = ?';
            $params[] = $_GET['date'];
        }
        if (!empty($_GET['search'])) {
            $sql .= ' AND title LIKE ?';
            $params[] = '%' . str_replace(['%', '_'], ['\\%', '\\_'], mb_substr((string)$_GET['search'], 0, 160)) . '%';
        }
        $sql .= ' ORDER BY status ASC, due_date ASC, created_at DESC LIMIT 500';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        respond(array_map('publicTask', $stmt->fetchAll()));
    }

    if ($path === '/tasks' && $method === 'POST') {
        $task = validatedTaskRequest($input);
        $stmt = $pdo->prepare('INSERT INTO tasks (user_id, title, description, category, difficulty, due_date) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$userId, $task['title'], $task['description'], $task['category'], $task['difficulty'], $task['dueDate']]);
        respond(['id' => (int)$pdo->lastInsertId()], 201);
    }

    if (preg_match('#^/tasks/([0-9]+)(?:/(complete|reopen))?$#', $path, $matches)) {
        $taskId = (int)$matches[1];
        $action = $matches[2] ?? '';
        if ($action === 'complete' && $method === 'POST') {
            completeTask($pdo, $userId, $taskId);
        }
        if ($action === 'reopen' && $method === 'POST') {
            $stmt = $pdo->prepare("UPDATE tasks SET status = 'pending', completed_at = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND status = 'completed'");
            $stmt->execute([$taskId, $userId]);
            if ($stmt->rowCount() === 0) {
                fail('Completed quest not found.', 404);
            }
            respond(['reopened' => true, 'rewardPolicy' => 'Rewards are one-time per quest.']);
        }
        if ($action === '' && $method === 'PUT') {
            $task = validatedTaskRequest($input);
            $stmt = $pdo->prepare("UPDATE tasks SET title = ?, description = ?, category = ?, difficulty = ?, due_date = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND status = 'pending'");
            $stmt->execute([$task['title'], $task['description'], $task['category'], $task['difficulty'], $task['dueDate'], $taskId, $userId]);
            if ($stmt->rowCount() === 0 && !taskExists($pdo, $userId, $taskId, 'pending')) {
                fail('Pending quest not found.', 404);
            }
            respond(['updated' => true]);
        }
        if ($action === '' && $method === 'DELETE') {
            $stmt = $pdo->prepare('UPDATE tasks SET deleted_at = NOW() WHERE id = ? AND user_id = ? AND deleted_at IS NULL');
            $stmt->execute([$taskId, $userId]);
            if ($stmt->rowCount() === 0) {
                fail('Quest not found.', 404);
            }
            respond(['deleted' => true]);
        }
    }

    if ($path === '/import' && $method === 'POST') {
        $rows = $input['tasks'] ?? null;
        if (!is_array($rows) || count($rows) < 1 || count($rows) > 100) {
            fail('Import must contain between 1 and 100 task rows.');
        }
        $validRows = [];
        $rejected = 0;
        foreach ($rows as $row) {
            if (!is_array($row)) {
                $rejected++;
                continue;
            }
            try {
                $validRows[] = validatedTask([
                    'title' => $row['title'] ?? '',
                    'description' => '',
                    'category' => $row['category'] ?? 'Personal',
                    'difficulty' => $row['difficulty'] ?? 'Easy',
                    'dueDate' => date('Y-m-d'),
                ]);
            } catch (InvalidArgumentException) {
                $rejected++;
            }
        }
        $imported = 0;
        $duplicates = 0;
        $pdo->beginTransaction();
        try {
            $insert = $pdo->prepare('INSERT IGNORE INTO tasks (user_id, title, category, difficulty, due_date, import_fingerprint) VALUES (?, ?, ?, ?, ?, ?)');
            $existing = $pdo->prepare('SELECT id FROM tasks WHERE user_id = ? AND due_date = ? AND LOWER(title) = LOWER(?) AND category = ? AND difficulty = ? AND deleted_at IS NULL LIMIT 1');
            foreach ($validRows as $row) {
                $existing->execute([$userId, $row['dueDate'], $row['title'], $row['category'], $row['difficulty']]);
                if ($existing->fetchColumn()) {
                    $duplicates++;
                    continue;
                }
                $fingerprint = hash('sha256', mb_strtolower($row['title']) . "\0" . $row['category'] . "\0" . $row['difficulty'] . "\0" . $row['dueDate']);
                $insert->execute([$userId, $row['title'], $row['category'], $row['difficulty'], $row['dueDate'], $fingerprint]);
                if ($insert->rowCount() > 0) {
                    $imported++;
                } else {
                    $duplicates++;
                }
            }
            evaluateAchievements($pdo, $userId);
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
        respond(['imported' => $imported, 'rejected' => $rejected, 'duplicates' => $duplicates], 201);
    }

    if ($path === '/achievements' && $method === 'GET') {
        respond(achievementData($pdo, $userId));
    }

    if ($path === '/analytics' && $method === 'GET') {
        respond(analyticsData($pdo, $user));
    }

    if ($path === '/profile' && $method === 'GET') {
        $stmt = $pdo->prepare('SELECT created_at, current_streak, best_streak, last_completed_on FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $profile = $stmt->fetch();
        respond([
            'createdAt' => date('F j, Y', strtotime($profile['created_at'])),
            'currentStreak' => activeStreak($profile),
            'bestStreak' => (int)$profile['best_streak'],
        ]);
    }

    if ($path === '/rewards' && $method === 'GET') {
        respond(rewardCatalog($pdo, $userId));
    }

    if ($path === '/rewards/purchase' && $method === 'POST') {
        if (!is_string($input['item'] ?? null)) {
            fail('Choose a valid reward.', 422);
        }
        purchaseReward($pdo, $userId, $input['item']);
    }

    if ($path === '/games/scores' && $method === 'GET') {
        $stmt = $pdo->prepare('SELECT id, game_key, score_value, details_json, created_at FROM game_scores WHERE user_id = ? ORDER BY created_at DESC LIMIT 100');
        $stmt->execute([$userId]);
        $bestStmt = $pdo->prepare('SELECT game_key, MIN(score_value) AS best_value FROM game_scores WHERE user_id = ? GROUP BY game_key');
        $bestStmt->execute([$userId]);
        $bestScores = [];
        foreach ($bestStmt->fetchAll() as $bestScore) {
            $bestScores[$bestScore['game_key']] = (int)$bestScore['best_value'];
        }
        respond(array_map(static fn(array $row): array => publicGameScore($row, $bestScores), $stmt->fetchAll()));
    }

    if ($path === '/games/scores' && $method === 'POST') {
        $score = validatedGameScore($input);
        $stmt = $pdo->prepare('INSERT INTO game_scores (user_id, game_key, score_value, details_json) VALUES (?, ?, ?, ?)');
        $stmt->execute([$userId, $score['game'], $score['value'], json_encode($score['details'], API_JSON_FLAGS)]);
        respond(['id' => (int)$pdo->lastInsertId()], 201);
    }

    if ($path === '/admin' && $method === 'GET') {
        requireAdmin($user);
        respond(adminData($pdo));
    }

    if (preg_match('#^/admin/users/([0-9]+)/status$#', $path, $matches) && $method === 'PATCH') {
        requireAdmin($user);
        $targetId = (int)$matches[1];
        if ($targetId === $userId) {
            fail('You cannot disable your own administrator account.');
        }
        if (!isset($input['active']) || !is_bool($input['active'])) {
            fail('Active status must be true or false.');
        }
        $stmt = $pdo->prepare("UPDATE users SET is_active = ? WHERE id = ? AND role != 'admin'");
        $stmt->execute([$input['active'] ? 1 : 0, $targetId]);
        if ($stmt->rowCount() === 0) {
            fail('User account not found or cannot be changed.', 404);
        }
        respond(['updated' => true]);
    }

    fail('API endpoint not found.', 404);
} catch (Throwable $error) {
    error_log('[LifeXP API] ' . $error->getMessage());
    fail('The server could not complete the request. Please try again.', 500);
}

function enforceAuthLimit(PDO $pdo, string $action): void
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $key = hash('sha256', $action . ':' . $ip);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM auth_attempts WHERE attempt_key = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)');
    $stmt->execute([$key]);
    if ((int)$stmt->fetchColumn() >= 10) {
        fail('Too many attempts. Wait 15 minutes before trying again.', 429);
    }
    $insert = $pdo->prepare('INSERT INTO auth_attempts (attempt_key) VALUES (?)');
    $insert->execute([$key]);
    if (random_int(1, 100) === 1) {
        $pdo->exec('DELETE FROM auth_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
    }
}

function initializeSession(int $userId): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function publicUser(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'xp' => (int)$user['total_xp'],
        'coins' => (int)$user['coins'],
        'level' => (int)$user['level'],
    ];
}

function validDate(string $date): bool
{
    $parts = explode('-', $date);
    return count($parts) === 3 && checkdate((int)$parts[1], (int)$parts[2], (int)$parts[0]);
}

function validatedTask(array $input): array
{
    $title = $input['title'] ?? '';
    $description = $input['description'] ?? '';
    $category = $input['category'] ?? 'Personal';
    $difficulty = $input['difficulty'] ?? 'Easy';
    $dueDate = $input['dueDate'] ?? date('Y-m-d');
    if (!is_string($title) || !is_string($description) || !is_string($category) || !is_string($difficulty) || !is_string($dueDate)) {
        throw new InvalidArgumentException('Task fields must be text.');
    }
    $title = trim($title);
    $description = trim($description);
    if ($title === '' || mb_strlen($title) > 160) {
        throw new InvalidArgumentException('Title must be between 1 and 160 characters.');
    }
    if (mb_strlen($description) > 1000) {
        throw new InvalidArgumentException('Description cannot exceed 1000 characters.');
    }
    if (!in_array($category, ['Study', 'Health', 'Fitness', 'Personal', 'Work', 'Other'], true)) {
        throw new InvalidArgumentException('Choose a valid task category.');
    }
    if (!in_array($difficulty, ['Easy', 'Medium', 'Hard'], true)) {
        throw new InvalidArgumentException('Choose a valid task difficulty.');
    }
    if (!validDate($dueDate)) {
        throw new InvalidArgumentException('Choose a valid due date.');
    }
    return compact('title', 'description', 'category', 'difficulty') + ['dueDate' => $dueDate];
}

function publicTask(array $task): array
{
    return [
        'id' => (int)$task['id'],
        'title' => $task['title'],
        'description' => $task['description'],
        'category' => $task['category'],
        'difficulty' => $task['difficulty'],
        'dueDate' => $task['due_date'],
        'completed' => $task['status'] === 'completed',
        'completedAt' => $task['completed_at'],
        'createdAt' => $task['created_at'],
    ];
}

function taskExists(PDO $pdo, int $userId, int $taskId, string $status): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM tasks WHERE id = ? AND user_id = ? AND status = ? AND deleted_at IS NULL');
    $stmt->execute([$taskId, $userId, $status]);
    return (bool)$stmt->fetchColumn();
}

function completeTask(PDO $pdo, int $userId, int $taskId): never
{
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT id, difficulty, status FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NULL FOR UPDATE');
        $stmt->execute([$taskId, $userId]);
        $task = $stmt->fetch();
        if (!$task) {
            $pdo->rollBack();
            fail('Quest not found.', 404);
        }
        if ($task['status'] === 'completed') {
            $pdo->commit();
            $userStmt = $pdo->prepare('SELECT total_xp, coins, level FROM users WHERE id = ?');
            $userStmt->execute([$userId]);
            $user = $userStmt->fetch();
            respond(['rewarded' => false, 'xpAwarded' => 0, 'coinsAwarded' => 0, 'xp' => (int)$user['total_xp'], 'coins' => (int)$user['coins'], 'level' => (int)$user['level']]);
        }

        $today = date('Y-m-d');
        $completion = $pdo->prepare('SELECT id FROM task_completions WHERE task_id = ?');
        $completion->execute([$taskId]);
        $alreadyRewarded = (bool)$completion->fetchColumn();
        $update = $pdo->prepare("UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?");
        $update->execute([$taskId]);
        $xp = 0;
        $coins = 0;
        if (!$alreadyRewarded) {
            $xp = xpReward($task['difficulty']);
            $coins = coinReward($task['difficulty']);
            $insertCompletion = $pdo->prepare('INSERT INTO task_completions (user_id, task_id, completed_on) VALUES (?, ?, ?)');
            $insertCompletion->execute([$userId, $taskId, $today]);
            $pdo->prepare('INSERT INTO xp_transactions (user_id, task_id, amount, reason) VALUES (?, ?, ?, ?)')->execute([$userId, $taskId, $xp, 'task-completion']);
            $pdo->prepare('INSERT INTO coin_transactions (user_id, task_id, amount, reason) VALUES (?, ?, ?, ?)')->execute([$userId, $taskId, $coins, 'task-completion']);
            $pdo->prepare('UPDATE users SET level = FLOOR((total_xp + ?) / 100) + 1, total_xp = total_xp + ?, coins = coins + ? WHERE id = ?')->execute([$xp, $xp, $coins, $userId]);
            updateStreak($pdo, $userId, $today);
            evaluateAchievements($pdo, $userId);
        }
        $pdo->commit();
        $userStmt = $pdo->prepare('SELECT total_xp, coins, level FROM users WHERE id = ?');
        $userStmt->execute([$userId]);
        $user = $userStmt->fetch();
        respond([
            'rewarded' => !$alreadyRewarded,
            'xpAwarded' => $xp,
            'coinsAwarded' => $coins,
            'xp' => (int)$user['total_xp'],
            'coins' => (int)$user['coins'],
            'level' => (int)$user['level'],
        ]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function dashboardData(PDO $pdo, array $user): array
{
    $userId = (int)$user['id'];
    $today = date('Y-m-d');
    $stmt = $pdo->prepare("SELECT COUNT(*) AS total, SUM(status = 'completed') AS completed FROM tasks WHERE user_id = ? AND due_date = ? AND deleted_at IS NULL");
    $stmt->execute([$userId, $today]);
    $daily = $stmt->fetch();
    $completedToday = (int)$daily['completed'];
    $totalToday = (int)$daily['total'];
    $weekStmt = $pdo->prepare('SELECT completed_on, COUNT(*) AS amount FROM task_completions WHERE user_id = ? AND completed_on >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY completed_on');
    $weekStmt->execute([$userId]);
    $counts = [];
    foreach ($weekStmt->fetchAll() as $row) {
        $counts[$row['completed_on']] = (int)$row['amount'];
    }
    $week = [];
    for ($offset = 6; $offset >= 0; $offset--) {
        $day = (new DateTimeImmutable($today))->modify("-{$offset} day");
        $date = $day->format('Y-m-d');
        $week[] = ['date' => $date, 'label' => $day->format('D'), 'count' => $counts[$date] ?? 0];
    }
    $tasksStmt = $pdo->prepare("SELECT id, title, description, category, difficulty, due_date, status, completed_at, created_at FROM tasks WHERE user_id = ? AND due_date = ? AND deleted_at IS NULL ORDER BY (status = 'pending') DESC, created_at ASC");
    $tasksStmt->execute([$userId, $today]);
    $achievementStmt = $pdo->prepare("SELECT a.id, a.name, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC LIMIT 3");
    $achievementStmt->execute([$userId]);
    $achievements = array_map(static fn(array $a): array => ['id' => $a['id'], 'name' => $a['name'], 'unlockedAt' => date('M j', strtotime($a['unlocked_at']))], $achievementStmt->fetchAll());
    $xp = (int)$user['total_xp'];
    return [
        'name' => $user['name'],
        'xp' => $xp,
        'coins' => (int)$user['coins'],
        'level' => (int)$user['level'],
        'title' => levelTitle((int)$user['level']),
        'completedToday' => $completedToday,
        'remainingToday' => max(0, $totalToday - $completedToday),
        'completionPercent' => $totalToday ? (int)round($completedToday / $totalToday * 100) : 0,
        'currentStreak' => activeStreak($user),
        'bestStreak' => (int)$user['best_streak'],
        'tasks' => array_map('publicTask', $tasksStmt->fetchAll()),
        'week' => $week,
        'recentAchievements' => $achievements,
    ];
}

function levelTitle(int $level): string
{
    return match (true) {
        $level >= 20 => 'Legend',
        $level >= 10 => 'Trailblazer',
        $level >= 5 => 'Pathfinder',
        $level >= 3 => 'Adventurer',
        default => 'Beginner',
    };
}

function activeStreak(array $user): int
{
    return currentStreakFor($user);
}

function achievementData(PDO $pdo, int $userId): array
{
    evaluateAchievements($pdo, $userId);
    $stmt = $pdo->prepare(
        'SELECT a.id, a.name, a.description, a.target, a.condition_key, ua.unlocked_at
         FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
         ORDER BY a.id'
    );
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    $userStmt = $pdo->prepare('SELECT level, current_streak, last_completed_on FROM users WHERE id = ?');
    $userStmt->execute([$userId]);
    $user = $userStmt->fetch();
    $counts = $pdo->prepare(
        "SELECT COUNT(*) AS total,
         SUM(CASE WHEN t.category = 'Study' THEN 1 ELSE 0 END) AS study,
         SUM(CASE WHEN t.category = 'Fitness' THEN 1 ELSE 0 END) AS fitness
         FROM task_completions c JOIN tasks t ON t.id = c.task_id WHERE c.user_id = ?"
    );
    $counts->execute([$userId]);
    $total = $counts->fetch();
    $progress = [
        'tasks' => (int)$total['total'],
        'study' => (int)$total['study'],
        'fitness' => (int)$total['fitness'],
        'streak' => activeStreak($user),
        'level' => (int)$user['level'],
    ];
    $imports = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND import_fingerprint IS NOT NULL');
    $imports->execute([$userId]);
    $progress['imports'] = (int)$imports->fetchColumn();
    return array_map(static function (array $row) use ($progress): array {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'target' => (int)$row['target'],
            'progress' => $progress[$row['condition_key']] ?? 0,
            'unlockedAt' => $row['unlocked_at'] ? date('M j, Y', strtotime($row['unlocked_at'])) : null,
        ];
    }, $rows);
}

function analyticsData(PDO $pdo, array $user): array
{
    $userId = (int)$user['id'];
    $counts = $pdo->prepare(
        "SELECT SUM(completed_on = CURDATE()) AS today,
         SUM(completed_on >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS week,
         SUM(completed_on >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS month
         FROM task_completions WHERE user_id = ?"
    );
    $counts->execute([$userId]);
    $totals = $counts->fetch();
    $todayTasks = $pdo->prepare("SELECT COUNT(*) AS total, SUM(status = 'completed') AS completed FROM tasks WHERE user_id = ? AND due_date = CURDATE() AND deleted_at IS NULL");
    $todayTasks->execute([$userId]);
    $todayTaskTotals = $todayTasks->fetch();
    $dailyStmt = $pdo->prepare('SELECT completed_on, COUNT(*) AS amount FROM task_completions WHERE user_id = ? AND completed_on >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) GROUP BY completed_on');
    $dailyStmt->execute([$userId]);
    $dailyCounts = [];
    foreach ($dailyStmt->fetchAll() as $row) {
        $dailyCounts[$row['completed_on']] = (int)$row['amount'];
    }
    $daily = [];
    for ($offset = 29; $offset >= 0; $offset--) {
        $day = (new DateTimeImmutable('today'))->modify("-{$offset} day");
        $date = $day->format('Y-m-d');
        $daily[] = ['date' => $date, 'label' => $day->format('M j'), 'count' => $dailyCounts[$date] ?? 0];
    }
    $dailyXpStmt = $pdo->prepare("SELECT DATE(created_at) AS earned_on, SUM(amount) AS amount FROM xp_transactions WHERE user_id = ? AND reason = 'task-completion' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) GROUP BY DATE(created_at)");
    $dailyXpStmt->execute([$userId]);
    $dailyXpCounts = [];
    foreach ($dailyXpStmt->fetchAll() as $row) {
        $dailyXpCounts[$row['earned_on']] = (int)$row['amount'];
    }
    $dailyXp = array_map(static fn(array $day): array => [
        'date' => $day['date'],
        'label' => $day['label'],
        'xp' => $dailyXpCounts[$day['date']] ?? 0,
    ], $daily);
    $categoryStmt = $pdo->prepare('SELECT t.category, COUNT(*) AS amount FROM task_completions c JOIN tasks t ON t.id = c.task_id WHERE c.user_id = ? GROUP BY t.category ORDER BY amount DESC');
    $categoryStmt->execute([$userId]);
    $categories = $categoryStmt->fetchAll();
    $totalCategories = array_sum(array_map(static fn(array $row): int => (int)$row['amount'], $categories));
    $categories = array_map(static fn(array $row): array => [
        'category' => $row['category'],
        'count' => (int)$row['amount'],
        'percentage' => $totalCategories ? (int)round((int)$row['amount'] / $totalCategories * 100) : 0,
    ], $categories);
    $difficultyStmt = $pdo->prepare('SELECT t.difficulty, COUNT(*) AS amount FROM task_completions c JOIN tasks t ON t.id = c.task_id WHERE c.user_id = ? GROUP BY t.difficulty ORDER BY t.difficulty ASC');
    $difficultyStmt->execute([$userId]);
    $difficulties = array_map(static fn(array $row): array => [
        'difficulty' => $row['difficulty'],
        'count' => (int)$row['amount'],
    ], $difficultyStmt->fetchAll());
    $mostProductive = $pdo->prepare('SELECT DAYNAME(completed_on) AS day_name, COUNT(*) AS amount FROM task_completions WHERE user_id = ? GROUP BY completed_on ORDER BY amount DESC, completed_on DESC LIMIT 1');
    $mostProductive->execute([$userId]);
    $productiveDay = $mostProductive->fetchColumn();
    $xp = $pdo->prepare("SELECT COALESCE(SUM(amount), 0) FROM xp_transactions WHERE user_id = ? AND reason = 'task-completion'");
    $xp->execute([$userId]);
    return [
        'today' => (int)($totals['today'] ?? 0),
        'todayPercent' => (int)$todayTaskTotals['total'] ? (int)round((int)$todayTaskTotals['completed'] / (int)$todayTaskTotals['total'] * 100) : 0,
        'week' => (int)($totals['week'] ?? 0),
        'month' => (int)($totals['month'] ?? 0),
        'currentStreak' => activeStreak($user),
        'bestStreak' => (int)$user['best_streak'],
        'xpEarned' => (int)$xp->fetchColumn(),
        'mostProductiveDay' => $productiveDay ?: null,
        'daily' => $daily,
        'dailyXp' => $dailyXp,
        'categories' => $categories,
        'difficulties' => $difficulties,
    ];
}

function validatedGameScore(array $input): array
{
    $game = $input['game'] ?? '';
    if (!is_string($game)) {
        fail('Invalid game result.', 422);
    }
    $score = match ($game) {
        'memory' => isset($input['moves']) && is_numeric($input['moves']) && (int)$input['moves'] >= 4 && (int)$input['moves'] <= 1000
            && isset($input['elapsedSeconds']) && is_numeric($input['elapsedSeconds']) && (int)$input['elapsedSeconds'] >= 1 && (int)$input['elapsedSeconds'] <= 3600
            ? [(int)$input['moves'], ['moves' => (int)$input['moves'], 'elapsedSeconds' => (int)$input['elapsedSeconds']]] : null,
        'reaction' => isset($input['milliseconds']) && is_numeric($input['milliseconds']) && (int)$input['milliseconds'] >= 50 && (int)$input['milliseconds'] <= 10000
            ? [(int)$input['milliseconds'], ['milliseconds' => (int)$input['milliseconds']]] : null,
        'guess' => isset($input['attempts']) && is_numeric($input['attempts']) && (int)$input['attempts'] >= 1 && (int)$input['attempts'] <= 100
            ? [(int)$input['attempts'], ['attempts' => (int)$input['attempts']]] : null,
        default => null,
    };
    if ($score === null) {
        fail('Invalid game result.', 422);
    }
    return ['game' => $game, 'value' => $score[0], 'details' => $score[1]];
}

function publicGameScore(array $row, array $bestScores = []): array
{
    $details = json_decode($row['details_json'], true) ?: [];
    $labels = ['memory' => 'Memory match', 'reaction' => 'Reaction time', 'guess' => 'Number guess'];
    $result = match ($row['game_key']) {
        'memory' => $row['score_value'] . ' moves',
        'reaction' => $row['score_value'] . ' ms',
        default => $row['score_value'] . ' guesses',
    };
    return [
        'id' => (int)$row['id'],
        'game' => $row['game_key'],
        'label' => $labels[$row['game_key']],
        'result' => $result,
        'details' => $details,
        'best' => isset($bestScores[$row['game_key']]) && (int)$row['score_value'] === $bestScores[$row['game_key']],
        'createdAt' => $row['created_at'],
    ];
}

function adminData(PDO $pdo): array
{
    $stats = [
        'users' => (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
        'completed' => (int)$pdo->query('SELECT COUNT(*) FROM task_completions')->fetchColumn(),
        'activeToday' => (int)$pdo->query('SELECT COUNT(DISTINCT user_id) FROM task_completions WHERE completed_on = CURDATE()')->fetchColumn(),
        'activeThisWeek' => (int)$pdo->query('SELECT COUNT(DISTINCT user_id) FROM task_completions WHERE completed_on >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)')->fetchColumn(),
        'achievements' => (int)$pdo->query('SELECT COUNT(*) FROM user_achievements')->fetchColumn(),
        'games' => (int)$pdo->query('SELECT COUNT(*) FROM game_scores')->fetchColumn(),
    ];
    $users = $pdo->query('SELECT id, name, email, role, is_active, level, created_at FROM users ORDER BY created_at DESC LIMIT 500')->fetchAll();
    return [
        'stats' => $stats,
        'users' => array_map(static fn(array $row): array => [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'email' => $row['email'],
            'role' => $row['role'],
            'active' => (bool)$row['is_active'],
            'level' => (int)$row['level'],
            'createdAt' => date('M j, Y', strtotime($row['created_at'])),
        ], $users),
    ];
}

function rewardItems(): array
{
    return [
        'starlight' => ['name' => 'Starlight title', 'description' => 'A little glow for your adventurer profile.', 'cost' => 25],
        'questkeeper' => ['name' => 'Questkeeper title', 'description' => 'For the one who keeps showing up.', 'cost' => 50],
        'trailblazer' => ['name' => 'Trailblazer title', 'description' => 'A rare title for your next chapter.', 'cost' => 100],
    ];
}

function rewardCatalog(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT item_key FROM reward_purchases WHERE user_id = ?');
    $stmt->execute([$userId]);
    $owned = array_flip($stmt->fetchAll(PDO::FETCH_COLUMN));
    $items = [];
    foreach (rewardItems() as $key => $item) {
        $items[] = ['key' => $key, ...$item, 'owned' => isset($owned[$key])];
    }
    return ['items' => $items];
}

function purchaseReward(PDO $pdo, int $userId, string $itemKey): never
{
    $catalog = rewardItems();
    if (!isset($catalog[$itemKey])) {
        fail('This reward is not available.', 404);
    }
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT coins FROM users WHERE id = ? FOR UPDATE');
        $stmt->execute([$userId]);
        $coins = (int)$stmt->fetchColumn();
        $alreadyOwned = $pdo->prepare('SELECT 1 FROM reward_purchases WHERE user_id = ? AND item_key = ?');
        $alreadyOwned->execute([$userId, $itemKey]);
        if ($alreadyOwned->fetchColumn()) {
            $pdo->rollBack();
            fail('You already own this reward.', 409);
        }
        $cost = $catalog[$itemKey]['cost'];
        if ($coins < $cost) {
            $pdo->rollBack();
            fail('You do not have enough coins for this reward.', 422);
        }
        $purchase = $pdo->prepare('INSERT INTO reward_purchases (user_id, item_key, coin_cost) VALUES (?, ?, ?)');
        $purchase->execute([$userId, $itemKey, $cost]);
        $pdo->prepare('UPDATE users SET coins = coins - ? WHERE id = ?')->execute([$cost, $userId]);
        $pdo->prepare('INSERT INTO coin_transactions (user_id, amount, reason) VALUES (?, ?, ?)')->execute([$userId, -$cost, 'cosmetic-purchase']);
        $pdo->commit();
        $balance = $pdo->prepare('SELECT coins FROM users WHERE id = ?');
        $balance->execute([$userId]);
        respond(['purchased' => true, 'coins' => (int)$balance->fetchColumn()]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}
