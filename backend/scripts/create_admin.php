<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script can only be run from the command line.\n");
    exit(1);
}

require_once __DIR__ . '/../src/bootstrap.php';

$name = trim((string)(getenv('ADMIN_NAME') ?: ''));
$email = strtolower(trim((string)(getenv('ADMIN_EMAIL') ?: '')));
$password = (string)(getenv('ADMIN_PASSWORD') ?: '');
if ($name === '' || mb_strlen($name) > 80 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 12 || strlen($password) > 72) {
    fwrite(STDERR, "Set ADMIN_NAME, ADMIN_EMAIL, and a 12-72 character ADMIN_PASSWORD in your terminal environment first.\n");
    exit(1);
}

$pdo = db();
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')");
    $stmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
    $userId = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO user_settings (user_id) VALUES (?)')->execute([$userId]);
    $pdo->commit();
} catch (PDOException $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($error->getCode() === '23000') {
        fwrite(STDERR, "That email address already has an account. No changes were made.\n");
        exit(1);
    }
    throw $error;
}
fwrite(STDOUT, "Administrator account created for {$email}.\n");
