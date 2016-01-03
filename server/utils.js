/**
 * Created by ld on 1/3/16.
 */

var get_moving_average = function (period) {
    var nums = [];
    return function (num) {
        nums.push(num);
        if (nums.length > period) {
            nums.splice(0, 1);
        }
        var sum = 0;
        for (var i = 0; i < nums.length; i++) {
            sum += nums[i];
        }
        var n = period;
        if (nums.length < period) {
            n = nums.length;
        }
        return (sum / n);
    }
}

var PIDController = function (gains) {
    this.k_p = gains.k_p || 1;
    this.k_i = gains.k_i || 0;
    this.k_d = gains.k_d || 0;

    this.sumError = 0;
    this.lastError = 0;

    this.target = 0;
};

PIDController.prototype.setTarget = function (target) {
    this.target = target;
};

PIDController.prototype.update = function (current_value) {
    this.current_value = current_value;

    var error = (this.target - this.current_value);
    this.sumError = this.sumError + error;
    var dError = error - this.lastError;
    this.lastError = error;
    return (this.k_p * error) + (this.k_i * this.sumError) + (this.k_d * dError);
};

var satf = function (input, min, max) {
    return Math.floor(Math.min(max, Math.max(min, parseInt(input))));
};


module.exports = {
    get_moving_average: get_moving_average,
    PIDController: PIDController,
    satf: satf
}