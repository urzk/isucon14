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
