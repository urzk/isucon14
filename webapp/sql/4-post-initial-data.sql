SET CHARACTER_SET_CLIENT = utf8mb4;
SET CHARACTER_SET_CONNECTION = utf8mb4;

USE isuride;

-- 初期データから chair_latest_locations を構築する
INSERT IGNORE INTO chair_latest_locations (chair_id, latitude, longitude, total_distance, total_distance_updated_at)
SELECT d.chair_id, l.latitude, l.longitude, d.total_distance, d.updated_at
FROM (SELECT chair_id,
             SUM(IFNULL(distance, 0)) AS total_distance,
             MAX(created_at)          AS updated_at
      FROM (SELECT chair_id,
                   created_at,
                   ABS(latitude - LAG(latitude) OVER (PARTITION BY chair_id ORDER BY created_at)) +
                   ABS(longitude - LAG(longitude) OVER (PARTITION BY chair_id ORDER BY created_at)) AS distance
            FROM chair_locations) tmp
      GROUP BY chair_id) d
       JOIN chair_locations l ON l.chair_id = d.chair_id AND l.created_at = d.updated_at;

-- ライドの最新ステータスを rides に持たせる (ride_statuses を都度引かないため)
-- updated_at は意味を持つ値なので、自動更新させないよう明示的に自身を代入する
ALTER TABLE rides
  ADD COLUMN latest_status ENUM ('MATCHING', 'ENROUTE', 'PICKUP', 'CARRYING', 'ARRIVED', 'COMPLETED') NOT NULL DEFAULT 'MATCHING',
  ADD INDEX idx_chair_id_latest_status (chair_id, latest_status),
  ADD INDEX idx_user_id_latest_status (user_id, latest_status);
UPDATE rides
SET latest_status = COALESCE((SELECT status FROM ride_statuses WHERE ride_id = rides.id ORDER BY created_at DESC LIMIT 1), 'MATCHING'),
    updated_at    = updated_at;

-- 初期データの完了済みライドから chair_stats を構築する
INSERT INTO chair_stats (chair_id, total_rides_count, total_evaluation)
SELECT chair_id, COUNT(*), IFNULL(SUM(evaluation), 0)
FROM rides
WHERE chair_id IS NOT NULL AND latest_status = 'COMPLETED'
GROUP BY chair_id;
