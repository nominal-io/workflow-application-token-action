import { describe, it } from 'vitest';
import { expect } from 'chai';
import { parsePermissions } from './main.js';

describe('parsePermissions', () => {

  describe('valid permissions', () => {

    it('should parse a single permission', () => {
      const result = parsePermissions('contents:read');
      expect(result).to.deep.equal({ contents: 'read' });
    });

    it('should parse multiple permissions', () => {
      const result = parsePermissions('contents:write, pull_requests:read');
      expect(result).to.deep.equal({ contents: 'write', pull_requests: 'read' });
    });

    it('should handle permissions without spaces', () => {
      const result = parsePermissions('contents:write,pull_requests:read');
      expect(result).to.deep.equal({ contents: 'write', pull_requests: 'read' });
    });

    it('should handle extra whitespace', () => {
      const result = parsePermissions('  contents : write ,  pull_requests : read  ');
      expect(result).to.deep.equal({ contents: 'write', pull_requests: 'read' });
    });

    it('should handle trailing comma', () => {
      const result = parsePermissions('contents:write,');
      expect(result).to.deep.equal({ contents: 'write' });
    });

    it('should return empty object for empty string', () => {
      const result = parsePermissions('');
      expect(result).to.deep.equal({});
    });

    it('should return empty object for whitespace-only string', () => {
      const result = parsePermissions('   ');
      expect(result).to.deep.equal({});
    });

  });

  describe('invalid permission format', () => {

    it('should reject permission without colon', () => {
      expect(() => parsePermissions('contents')).to.throw(
        'Invalid permission entry "contents". Expected format: "name:level"'
      );
    });

    it('should reject permission with multiple colons', () => {
      expect(() => parsePermissions('contents:read:extra')).to.throw(
        'Invalid permission entry "contents:read:extra". Expected format: "name:level"'
      );
    });

    it('should reject empty permission name', () => {
      expect(() => parsePermissions(':read')).to.throw(
        'Permission name cannot be empty'
      );
    });

    it('should reject empty permission level', () => {
      expect(() => parsePermissions('contents:')).to.throw(
        'Permission level cannot be empty'
      );
    });

  });

  describe('dash validation (underscore vs dash)', () => {

    it('should reject permission with dashes and suggest underscore alternative', () => {
      expect(() => parsePermissions('pull-requests:write')).to.throw(
        'Invalid permission key "pull-requests". GitHub App permissions use underscores, not dashes. Did you mean "pull_requests"?'
      );
    });

    it('should reject permission with multiple dashes', () => {
      expect(() => parsePermissions('secret-scanning-alerts:read')).to.throw(
        'Invalid permission key "secret-scanning-alerts". GitHub App permissions use underscores, not dashes. Did you mean "secret_scanning_alerts"?'
      );
    });

    it('should include explanation about GitHub Actions vs GitHub App syntax', () => {
      expect(() => parsePermissions('pull-requests:write')).to.throw(
        'GitHub Actions workflow permissions use dashes'
      );
    });

  });

  describe('permission level validation', () => {

    it('should accept "read" level', () => {
      const result = parsePermissions('contents:read');
      expect(result).to.deep.equal({ contents: 'read' });
    });

    it('should accept "write" level', () => {
      const result = parsePermissions('contents:write');
      expect(result).to.deep.equal({ contents: 'write' });
    });

    it('should reject invalid permission level', () => {
      expect(() => parsePermissions('contents:admin')).to.throw(
        'Invalid permission level "admin" for "contents". Must be one of: read, write.'
      );
    });

    it('should reject uppercase permission level', () => {
      expect(() => parsePermissions('contents:READ')).to.throw(
        'Invalid permission level "READ" for "contents". Must be one of: read, write.'
      );
    });

  });

});
