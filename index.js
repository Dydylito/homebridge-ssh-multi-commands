var Service;
var Characteristic;

var ssh = require('ssh-exec'),
    assign = require('object-assign');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-ssh-multi-commands', 'SSH Switch', SshAccessory);
}

function SshAccessory(log, config) {
  this.log = log;
  this.service = 'Switch';

  this.name = config['name'];
  this.onCommand = config['on'];
  this.offCommand = config['off'];
  this.stateCommand = config['state'];
  this.onValue = config['on_value'] || "";
  this.onValue = this.onValue.trim().toLowerCase();
  this.exactMatch = config['exact_match'] || true;
  this.ssh = assign({
    user: config['user'],
    host: config['host'],
    password: config['password'],
    key: config['key']
  }, config['ssh']);
}

SshAccessory.prototype.matchesString = function(match) {
  if(this.exactMatch) {
    return (match === this.onValue);
  }
  else {
    return (match.indexOf(this.onValue) > -1);
  }
}

SshAccessory.prototype.setState = function(powerOn, callback) {
  var accessory = this;
  var state = powerOn ? 'on' : 'off';
  var prop = state + 'Command';
  var commands = accessory[prop];

  // check if commands is an array, if not make it an array
  if (!Array.isArray(commands)) {
    commands = [commands];
  }

  var stream = function(command, cb) {
    var stream = ssh(command, accessory.ssh);
    stream.on('error', function (err) {
      accessory.log('Error: ' + err);
      cb(err);
    });
    stream.on('finish', function () {
      cb();
    });
  }

  async.eachSeries(commands, stream, function(err) {
    if (err) {
      callback(err);
    } else {
      accessory.log('Set ' + accessory.name + ' to ' + state);
      callback(null);
    }
  });
}


SshAccessory.prototype.getState = function(callback) {
  var accessory = this;
  var command = accessory['stateCommand'];

  var stream = ssh(command, accessory.ssh);

  stream.on('error', function (err) {
    accessory.log('Error: ' + err);
    callback(err || new Error('Error getting state of ' + accessory.name));
  });

  stream.on('data', function (data) {
    var state = data.toString('utf-8').trim().toLowerCase();
    accessory.log('State of ' + accessory.name + ' is: ' + state);
    callback(null, accessory.matchesString(state));
  });
}

SshAccessory.prototype.getServices = function() {
  var informationService = new Service.AccessoryInformation();
  var switchService = new Service.Switch(this.name);

  informationService
  .setCharacteristic(Characteristic.Manufacturer, 'SSH Manufacturer')
  .setCharacteristic(Characteristic.Model, 'SSH Model')
  .setCharacteristic(Characteristic.SerialNumber, 'SSH Serial Number');

  var characteristic = switchService.getCharacteristic(Characteristic.On)
  .on('set', this.setState.bind(this));

  if (this.stateCommand) {
    characteristic.on('get', this.getState.bind(this))
  };

  return [switchService];
}