/**
 * Created by ld on 1/3/16.
 */


module.exports = {
    WEBSERVER_PORT: 8002,
    SERVO_PIN: 11,
    TACH_PIN: 12,
    TACH_MAX_DELTA: 500,
    camera: {
        DEVICE: "/dev/video1",
        CAPTURE_INTERVAL_MS: 120
    },
    engine_controller: {
        UPDATE_INTERVAL_MS: 20,
        DEFAULT_COMMAND_RPM: 500,
        SERVO_MAX_THROTTLE: 23,
        SERVO_MIN_THROTTLE: 65,
        GAINS: {
            k_p: -0.25,
            k_i: -0.000025,
            k_d: 0.2
        }
    }
}

