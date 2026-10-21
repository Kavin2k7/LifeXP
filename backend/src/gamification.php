<?php
declare(strict_types=1);

function xpReward(string $difficulty): int
{
    return ['Easy' => 10, 'Medium' => 20, 'Hard' => 40][$difficulty] ?? 0;
}

function coinReward(string $difficulty): int
{
    return ['Easy' => 1, 'Medium' => 2, 'Hard' => 4][$difficulty] ?? 0;
}

function evaluateAchievements(PDO $pdo, int $userId): void
{
    $stmt = $pdo->prepare('SELECT total_xp, level, current_streak, last_completed_on FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    $counts = $pdo->prepare(
        "SELECT COUNT(*) AS total,
            SUM(CASE WHEN t.category = 'Study' THEN 1 ELSE 0 END) AS study,
            SUM(CASE WHEN t.category = 'Fitness' THEN 1 ELSE 0 END) AS fitness
         FROM task_completions c JOIN tasks t ON t.id = c.task_id WHERE c.user_id = ?"
    );
    $counts->execute([$userId]);
    $totals = $counts->fetch();
    $values = [
        'tasks' => (int)$totals['total'],
        'study' => (int)$totals['study'],
        'fitness' => (int)$totals['fitness'],
        'streak' => currentStreakFor($user),
        'level' => (int)$user['level'],
    ];
    $imports = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND import_fingerprint IS NOT NULL');
    $imports->execute([$userId]);
    $values['imports'] = (int)$imports->fetchColumn();
    $stmt = $pdo->query('SELECT id, target, condition_key FROM achievements');
    $insert = $pdo->prepare('INSERT IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)');
    foreach ($stmt->fetchAll() as $achievement) {
        $progress = $values[$achievement['condition_key']] ?? 0;
        if ($progress >= (int)$achievement['target']) {
            $insert->execute([$userId, $achievement['id']]);
        }
    }
}

function currentStreakFor(array $user): int
{
    $last = $user['last_completed_on'] ?? null;
    $today = date('Y-m-d');
    $yesterday = (new DateTimeImmutable($today))->modify('-1 day')->format('Y-m-d');
    return $last && in_array($last, [$today, $yesterday], true) ? (int)$user['current_streak'] : 0;
}

function updateStreak(PDO $pdo, int $userId, string $today): void
{
    $stmt = $pdo->prepare('SELECT current_streak, best_streak, last_completed_on FROM users WHERE id = ? FOR UPDATE');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    $yesterday = (new DateTimeImmutable($today))->modify('-1 day')->format('Y-m-d');
    if ($user['last_completed_on'] === $today) {
        return;
    }
    $current = $user['last_completed_on'] === $yesterday ? (int)$user['current_streak'] + 1 : 1;
    $best = max((int)$user['best_streak'], $current);
    $update = $pdo->prepare('UPDATE users SET current_streak = ?, best_streak = ?, last_completed_on = ? WHERE id = ?');
    $update->execute([$current, $best, $today, $userId]);
}
